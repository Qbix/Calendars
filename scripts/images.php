#!/usr/bin/env php
<?php

if (!defined('RUNNING_FROM_APP')) {
	die("This script must be run from an app context.\n");
}

set_time_limit(0);

/**
 * CONFIG
 */
$MAX_INDEX = 1000;
$EXT = 'jpg';

/**
 * Batch config
 */
$BATCH_SIZE = (int) Q_Config::get('AI', 'images', 'batch', 2);
if ($BATCH_SIZE <= 1) {
	$BATCH_SIZE = 0;
}

/**
 * CLI options
 */
$opts = getopt('', array(
	'size:',
	'orientation:',
	'image:',
	'llm:',
	'text',
	'importance:'
));

$imageAdapter = Q::ifset($opts, 'image', null);
$llmAdapter   = Q::ifset($opts, 'llm', null);

$allowText = isset($opts['text']);
$minImportance = Q::ifset($opts, 'importance', 7);

/**
 * Default: OpenAI + text
 */
if (!$imageAdapter) {
	$imageAdapter = 'openai';
	$allowText = true;
}

/**
 * Resolve size / orientation
 */
$orientation = isset($opts['orientation'])
	? strtolower($opts['orientation'])
	: 'square';

if (!empty($opts['size']) && preg_match('/^(\d+)x(\d+)$/', $opts['size'], $m)) {
	$width  = (int) $m[1];
	$height = (int) $m[2];
} else {
	switch ($orientation) {
		case 'portrait':
			$width = 1024; $height = 1536;
			break;
		case 'landscape':
			$width = 1536; $height = 1024;
			break;
		default:
			$width = 1024; $height = 1024;
	}
}
$size = $width . 'x' . $height;

/**
 * Load configs
 */
$globalHolidays = json_decode(
	@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidays.json'),
	true
);
$holidaysWithCountries = json_decode(
	@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidaysWithCountries.json'),
	true
);
$countryLanguages = json_decode(
	@file_get_contents(PLACES_PLUGIN_CONFIG_DIR . DS . 'languages.json'),
	true
);
$festivenessMap = json_decode(
	@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'festiveness.json'),
	true
);
$holidayImportance = json_decode(
	@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'importance.json'),
	true
);

if (!$globalHolidays || !$countryLanguages) {
	die("Failed to load configs\n");
}

/**
 * Collect languages
 */
$allLanguages = array();
foreach ($countryLanguages as $langs) {
	if (!is_array($langs)) continue;
	foreach ($langs as $lang) {
		$allLanguages[$lang] = true;
	}
}

/**
 * Scene templates
 */
$SCENES = array(
	'somber' => array(
		'a solemn ceremonial scene with restrained motion, symbolic objects, and reverent atmosphere',
		'a quiet commemorative composition with low movement and dignified presence',
		'a reflective painterly scene centered on remembrance and collective memory'
	),
	'universal' => array(
		'an ornate cultural scene featuring traditional objects and symbolism',
		'a richly detailed cultural environment emphasizing craftsmanship',
		'a layered painterly composition inspired by historical poster traditions'
	),
	'festive' => array(
		'a vivid celebratory scene filled with light, motion, and ornamentation',
		'a joyful composition combining cultural motifs and dramatic lighting',
		'a richly ornamented festive environment with gathering and ritual'
	)
);

/**
 * Prompt templates
 */
$TEMPLATES = array(
	'somber' => array(
		'Respectful commemorative image for {{culture}} holiday of {{holiday}}. {{scene}}. Text in {{language}}.',
		'Memorial-style image for {{culture}} holiday of {{holiday}}. {{scene}}. Text in {{language}}.'
	),
	'universal' => array(
		'Highly detailed cultural image for {{culture}} holiday of {{holiday}}. {{scene}}. Text in {{language}}.',
		'Artistic holiday illustration for {{culture}} holiday of {{holiday}}. {{scene}}. Text in {{language}}.'
	),
	'festive' => array(
		'Vibrant celebratory image for {{culture}} holiday of {{holiday}}. {{scene}}. Text in {{language}}.',
		'Festive holiday image for {{culture}} holiday of {{holiday}}. {{scene}}. Text in {{language}}.'
	)
);

/**
 * Festiveness tier
 */
function festivenessTier($holidayKey, $festivenessMap)
{
	if (!isset($festivenessMap[$holidayKey])) return 'universal';
	$v = (int) $festivenessMap[$holidayKey];
	if ($v <= 3) return 'somber';
	if ($v <= 6) return 'universal';
	return 'festive';
}

/**
 * Prompt generator
 */
function generatePrompt(
	$culture,
	$holiday,
	$languageName,
	$scene,
	$template,
	$orientation,
	$allowText,
	$imageAdapter
) {
	$prompt = str_replace(
		array('{{culture}}', '{{holiday}}', '{{scene}}', '{{language}}'),
		array($culture, $holiday, $scene, $languageName),
		$template
	);

	switch ($orientation) {
		case 'portrait':  $prompt .= ' Vertical composition.'; break;
		case 'landscape': $prompt .= ' Wide cinematic composition.'; break;
		default:          $prompt .= ' Balanced square composition.';
	}

	if ($allowText) {
		$prompt .= "\nProminent holiday greeting with title and subtitle.";
	} else {
		$prompt .= "\nDo NOT render any text or writing.";
	}

	$prompt .= "\nHigh detail. Ornate. Painterly. Cinematic lighting.";

	/* IMPORTANT: style constraints ONLY for OpenAI */
	if ($imageAdapter === 'openai') {
		$prompt .= <<<EOT

No flat illustration.
No cartoon style.
No minimalism.
No flat vector art.
Very important:
No Studio Ghibli style.
No storybook illustration.
No pastel children's art.
EOT;
	}

	return $prompt;
}

/**
 * Adapters
 */
$image = AI_Image::create($imageAdapter);
$llm   = $llmAdapter ? AI_LLM::create($llmAdapter) : null;

if (!$image) {
	die("Missing image adapter: {$imageAdapter}\n");
}

/**
 * Batch helpers
 */
$batchCounts = array(
	'image' => 0,
	'llm' => 0
);
function batchUse($batchName) {
	global $batchCounts, $BATCH_SIZE;
	if ($BATCH_SIZE && $batchCounts[$batchName] === 0) {
		Q_Utils::batchUse($batchName);
	}
}
function batchCommit($batchName) {
	global $batchCounts, $BATCH_SIZE;
	$batchCounts[$batchName]++;
	if ($BATCH_SIZE && $batchCounts[$batchName] >= $BATCH_SIZE) {
		Q_Utils::batchExecute($batchName);
		$batchCounts[$batchName] = 0;
	}
}

/**
 * MAIN LOOP
 */
for ($index = 2; $index <= $MAX_INDEX; $index++) {

	foreach ($globalHolidays as $date => $entries) {

		if ($date < date("Y-m-d")) {
			continue;
		}

		$year = substr($date, 0, 4);

		foreach ($entries as $entry) {
			foreach ($entry as $culture => $holidays) {
				foreach ($holidays as $holiday) {

					$key = Q_Utils::normalize($holiday);
					$tier = festivenessTier($key, $festivenessMap);
					$importance = Q::ifset($holidayImportance, $key, 0);
					if ($importance < $minImportance) {
						continue;
					}

					$countries = Q::ifset($holidaysWithCountries, $culture, $holiday, 'countries', array());
					$maxLanguages = 10;
					$languagesPerCountry = 4;
					$languageCounts = array();

					// Count how many countries each language appears in
					foreach ($countries as $country) {
						if ($country === null) break;  // Stop at diaspora separator
						$countryLangs = array_slice(
							Q::ifset($countryLanguages, $country, array()), 
							0, 
							$languagesPerCountry
						);
						
						foreach ($countryLangs as $lang) {
							$languageCounts[$lang] = isset($languageCounts[$lang]) 
								? $languageCounts[$lang] + 1 
								: 1;
						}
					}
					// Sort by frequency (most countries first)
					arsort($languageCounts);
					// Take top N languages
					$languages = array_slice(array_keys($languageCounts), 0, $maxLanguages);

					foreach ($languages as $lang) {

						$langInfo = Q_Text::languagesInfo();
						if (empty($langInfo[$lang]['name'])) continue;

						$outDir = APP_WEB_DIR . DS . 'Q' . DS . 'plugins' . DS . 'Calendars' . DS . 'img'
							. DS . 'holidays' . DS . $culture . DS . $key . DS . $year . '-' . $index;

						if (!is_dir($outDir)) mkdir($outDir, 0755, true);

						$langDir = $outDir . DS . $lang;
						if (is_dir($langDir) && glob($langDir . DS . '*.' . $EXT)) {
							continue; // assume image already generated
						}
						mkdir($langDir, 0755, true);

						$path = $langDir . DS . $size . '.' . $EXT;

						$scene    = $SCENES[$tier][array_rand($SCENES[$tier])];
						$template = $TEMPLATES[$tier][array_rand($TEMPLATES[$tier])];

						$prompt = generatePrompt(
							$culture,
							$holiday,
							$langInfo[$lang]['name'],
							$scene,
							$template,
							$orientation,
							$allowText,
							$imageAdapter
						);

						$attributes = array(
							// semanticExtraction
							'title' => "Happy {$holiday}",
							'holidayName' => $holiday,
							'startDate' => $date,
							'endDate' => $date,

							// holidayAnalysis
							'holidayImportance' => Q::ifset($holidayImportance, $key, null),

							// languageQuality
							'language' => $lang,

							// culturalRelevance
							'countries' => $countries,
							'culturalSpecificity' => count($countries) ? 7 : null,

							// timing
							'dates' => array(array($date, $date)),
							'evergreen' => 0,

							// contentClassification
							'contentType' => 'greeting',
							'occasion' => array($key),
							'tone' => array($tier),
							'sentiment' => 'positive',

							// discoveryQuality
							'keywords' => array_map('strtolower', preg_split('/\s+/', $holiday)),
							'confidence' => 0.6
						);


						batchUse('image');

						$streamType = 'Streams/image';
						$observationsType = 'holiday';
						$options = array(
							'format' => $EXT,
							'width'  => $width,
							'height' => $height,
							'callback' => function ($r) use (
								$path,
								$llm,
								$streamType,
								$observationsType,
								$attributes,
							) {
								processGeneratedImage(
									$r,
									$path,
									$llm,
									$streamType,
									$observationsType,
									$attributes
								);
							}
						);

						/*
						* Adapter-specific options
						*/
						switch ($imageAdapter) {
							case 'google':
								$options['size'] = $size;
								break;

							case 'openai':
								$options['size'] = $size;
								$options['quality'] = 'hd';
								break;

							case 'ideogram':
							default:
								// ideogram: no size, no quality
								break;
						}

						$image->generate($prompt, $options);

						batchCommit('image');
						continue;
					}
				}
			}
		}
		break 2;
	}
}

if ($BATCH_SIZE) {
	Q_Utils::batchExecute('image');
	Q_Utils::batchExecute('llm');
}

echo "Holiday image generation complete.\n";


function processGeneratedImage(
	$r,
	$path,
	$llm,
	$streamType,
	$observationsType,
	$attributes
) {
	if (empty($r['data'])) return;

	$data = $r['data'];

	file_put_contents($path, $data);

	if (!$llm) {
		finalizeStream($streamType, $observationsType, $path, $attributes, $data);
		return;
	}

	batchUse('llm');

	$llm->process(
		array('images' => array($r['data'])),
		AI_LLM::observations($streamType, $observationsType),
		array(),
		array(
			'callback' => function ($results) use (
				$attributes,
				$streamType,
				$observationsType,
				$path,
				$data
			) {
				$attributes = array_merge(
					$attributes,
					AI_LLM::attributesFromObservationResults(
						$results,
						$streamType,
						$observationsType
					)
				);
				finalizeStream($streamType, $observationsType, $path, $attributes, $data);
			}
		)
	);

	batchCommit('llm');
}

function finalizeStream($streamType, $observationsType, $path, $attributes, $data) {
	$icon = str_replace(array(DS, APP_WEB_DIR . '/'), array('/', ''), dirname($path));
	$ok = AI_LLM::createStream(
		$streamType,
		$observationsType,
		array(
			'icon' => $icon
		),
		$attributes,
		array(
			'accept' => true
		)
	);

	if ($ok) {
		$tempKey = 'tmp_' . uniqid('', true);
		$paths = Q_Image::save(array(
			'data' => $data,
			'path' => $icon,
			'subpath' => "",
			'save' => 'Streams/image',
			'skipAccess' => true
		));
		@unlink($path);
	}
}