#!/usr/bin/env php
<?php

if (!defined('RUNNING_FROM_APP')) {
	die("This script must be run from an app context.\n");
}

set_time_limit(0);

echo "[init] Starting holiday image generation\n";

/**
 * CONFIG
 */
$VERSIONS_MAX = Q_Config::get('Calendars', 'holidays', 'images', 'versionsMax', 3);
$EXT = 'jpg';
echo "[config] versionsMax={$VERSIONS_MAX}, ext={$EXT}\n";

/**
 * Batch config
 */
$BATCH_SIZE = (int) Q_Config::get('AI', 'images', 'batch', 2);
if ($BATCH_SIZE <= 1) {
	$BATCH_SIZE = 0;
}
echo "[config] batchSize={$BATCH_SIZE}\n";

/**
 * CLI options
 */
$opts = getopt('', array(
	'size:',
	'orientation:',
	'image:',
	'llm:',
	'text',
	'importance:',
	'weeks:'
));

// How far into the future to generate (weeks)
$WEEKS = (int) Q_Config::get('Calendars', 'holidays', 'images', 'weeks', 12);
if ($WEEKS <= 0) {
	$WEEKS = 12;
}

if (isset($opts['weeks'])) {
	$cliWeeks = (int) $opts['weeks'];
	if ($cliWeeks > 0) {
		$WEEKS = $cliWeeks;
		echo "[config] weeks overridden from CLI: {$WEEKS}\n";
	}
}

$maxDate = (new DateTime('now', new DateTimeZone('UTC')))
	->modify('+' . $WEEKS . ' weeks')
	->format('Y-m-d');

$today = gmdate("Y-m-d");
echo "[config] today={$today}, futureWeeks={$WEEKS}, maxDate={$maxDate}\n";

// adapters

$imageAdapter = Q::ifset($opts, 'image', null);
$llmAdapter   = Q::ifset($opts, 'llm', null);

$allowText = isset($opts['text']);
$minImportance = Q::ifset($opts, 'importance', 7);

echo "[opts] imageAdapter={$imageAdapter}, llmAdapter={$llmAdapter}, allowText=" . ($allowText ? '1' : '0') . ", minImportance={$minImportance}\n";

/**
 * Default: OpenAI + text
 */
if (!$imageAdapter) {
	$imageAdapter = 'openai';
	$allowText = true;
	echo "[opts] defaulting to imageAdapter=openai, allowText=1\n";
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
echo "[config] orientation={$orientation}, size={$size}\n";

/**
 * Load configs
 */
echo "[load] Loading holiday configs...\n";

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
	die("[error] Failed to load configs\n");
}

echo "[load] Loaded " . count($globalHolidays) . " dates from holidays.json\n";
echo "[load] Loaded configs OK\n";

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
echo "[load] Collected " . count($allLanguages) . " unique languages\n";

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

echo "[templates] Loaded scene and prompt templates\n";

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
	die("[error] Missing image adapter: {$imageAdapter}\n");
}

echo "[adapters] image={$imageAdapter}, llm=" . ($llm ? $llmAdapter : 'none') . "\n";

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
		echo "[batch] begin {$batchName}\n";
		Q_Utils::batchUse($batchName);
	}
}
function batchCommit($batchName) {
	global $batchCounts, $BATCH_SIZE;
	$batchCounts[$batchName]++;
	echo "[batch] commit {$batchName} ({$batchCounts[$batchName]})\n";
	if ($BATCH_SIZE && $batchCounts[$batchName] >= $BATCH_SIZE) {
		echo "[batch] execute {$batchName}\n";
		Q_Utils::batchExecute($batchName);
		$batchCounts[$batchName] = 0;
	}
}

/**
 * MAIN LOOP
 */
echo "[main] Beginning main generation loop\n";

$stats = array(
	'dates_processed' => 0,
	'dates_skipped_past' => 0,
	'dates_skipped_future' => 0,
	'holidays_processed' => 0,
	'holidays_skipped_importance' => 0,
	'images_requested' => 0,
	'images_skipped_exists' => 0
);

$baseOut = APP_WEB_DIR . DS . 'Q' . DS . 'plugins' . DS . 'Calendars' . DS . 'img' . DS . 'holidays';

for ($version = 1; $version <= $VERSIONS_MAX; $version++) {

	echo "[loop] ========== VERSION {$version}/{$VERSIONS_MAX} ==========\n";

	foreach ($globalHolidays as $date => $entries) {

		if ($date < $today) {
			$stats['dates_skipped_past']++;
			continue;
		}

		if ($date > $maxDate) {
			echo "[stop] Date {$date} exceeds maxDate {$maxDate}, stopping\n";
			$stats['dates_skipped_future']++;
			break 2;
		}

		$stats['dates_processed']++;
		echo "[date] Processing {$date}\n";
		$year = substr($date, 0, 4);

		$holidayCount = 0;
		foreach ($entries as $entry) {
			foreach ($entry as $culture => $holidays) {
				$holidayCount += count($holidays);
			}
		}
		echo "[date] {$date} has {$holidayCount} holiday(s)\n";

		foreach ($entries as $entry) {
			foreach ($entry as $culture => $holidays) {
				foreach ($holidays as $holiday) {

					$key = Q_Utils::normalize($holiday);
					$tier = festivenessTier($key, $festivenessMap);
					$importance = Q::ifset($holidayImportance, $key, 0);
					
					if ($importance < $minImportance) {
						echo "[skip] '{$holiday}' importance={$importance} < {$minImportance}\n";
						$stats['holidays_skipped_importance']++;
						continue;
					}

					$stats['holidays_processed']++;
					echo "[holiday] '{$holiday}' ({$culture}) tier={$tier} importance={$importance}\n";

					$countries = Q::ifset($holidaysWithCountries, $culture, $holiday, 'countries', array());
					$maxLanguages = 10;
					$languagesPerCountry = 4;
					$languageCounts = array();

					echo "[holiday] Found " . count($countries) . " countries\n";

					// Count how many countries each language appears in
					foreach ($countries as $country) {
						if ($country === null) {
							echo "[holiday] Reached diaspora separator\n";
							break;  // Stop at diaspora separator
						}
						$countryLangs = array_slice(
							Q::ifset($countryLanguages, $country, array()), 
							0, 
							$languagesPerCountry
						);
						
						echo "[country] {$country}: " . count($countryLangs) . " languages\n";
						
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

					echo "[holiday] Selected " . count($languages) . " languages: " . implode(', ', $languages) . "\n";

					$realVersion = nextHolidayVersion($baseOut, $culture, $key, $year);
					$outDir = $baseOut . DS . $culture . DS . $key . DS . $year . '-' . $realVersion;

					if (!is_dir($outDir)) {
						mkdir($outDir, 0755, true);
						echo "[mkdir] Created {$outDir}\n";
					}

					foreach ($languages as $lang) {

						$langInfo = Q_Text::languagesInfo();
						if (empty($langInfo[$lang]['name'])) {
							echo "[skip] Language '{$lang}' has no name info\n";
							continue;
						}

						echo "[lang] Processing {$lang} (" . $langInfo[$lang]['name'] . ")\n";

						$langDir = $outDir . DS . $lang;
						if (is_dir($langDir) && glob($langDir . DS . '*.' . $EXT)) {
							echo "[skip] {$langDir} already exists with images\n";
							$stats['images_skipped_exists']++;
							continue; // assume image already generated
						}
						
						mkdir($langDir, 0755, true);
						echo "[mkdir] Created {$langDir}\n";

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

						echo "[gen] Target: {$path}\n";
						echo "[prompt] " . substr(str_replace("\n", " ", $prompt), 0, 120) . "...\n";

						$attributes = array(
							// semanticExtraction
							'title' => "Happy {$holiday}",
							'holidayName' => $holiday,
							'startDate' => $date,
							'endDate' => $date,

							// Jewish,
							'culture' => $culture,

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
								$attributes
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
								echo "[adapter] Google: size={$size}\n";
								break;

							case 'openai':
								$options['size'] = $size;
								$options['quality'] = 'hd';
								echo "[adapter] OpenAI: size={$size}, quality=hd\n";
								break;

							case 'ideogram':
							default:
								echo "[adapter] Ideogram: using defaults\n";
								// ideogram: no size, no quality
								break;
						}

						echo "[api] Requesting image generation...\n";
						$image->generate($prompt, $options);
						$stats['images_requested']++;

						batchCommit('image');
					}
				}
			}
		}
	}
}

if ($BATCH_SIZE) {
	echo "[batch] Final flush starting\n";
	if ($batchCounts['image']) {
		echo "[batch] Flushing {$batchCounts['image']} pending image requests\n";
		Q_Utils::batchExecute('image');
	}
	if ($batchCounts['llm']) {
		echo "[batch] Flushing {$batchCounts['llm']} pending LLM requests\n";
		Q_Utils::batchExecute('llm');
	}
}

echo "\n[stats] ========== GENERATION COMPLETE ==========\n";
echo "[stats] Dates processed: {$stats['dates_processed']}\n";
echo "[stats] Dates skipped (past): {$stats['dates_skipped_past']}\n";
echo "[stats] Dates skipped (future): {$stats['dates_skipped_future']}\n";
echo "[stats] Holidays processed: {$stats['holidays_processed']}\n";
echo "[stats] Holidays skipped (importance): {$stats['holidays_skipped_importance']}\n";
echo "[stats] Images requested: {$stats['images_requested']}\n";
echo "[stats] Images skipped (exists): {$stats['images_skipped_exists']}\n";
echo "[done] Holiday image generation complete\n";


function processGeneratedImage(
	$r,
	$path,
	$llm,
	$streamType,
	$observationsType,
	$attributes
) {
	if (empty($r['data'])) {
		echo "[callback] ERROR: empty image result for {$path}\n";
		return;
	}

	$data = $r['data'];

	echo "[callback] Image generated successfully\n";
	echo "[callback] Writing to: {$path}\n";
	file_put_contents($path, $data);
	echo "[callback] File size: " . strlen($data) . " bytes\n";

	if (!$llm) {
		echo "[callback] No LLM configured, finalizing stream directly\n";
		finalizeStream($streamType, $observationsType, $path, $attributes, $data);
		return;
	}

	batchUse('llm');

	echo "[llm] Processing observations for generated image\n";

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
				echo "[llm] Observations processing complete\n";
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
	echo "[finalize] Starting finalization for {$path}\n";
	
	$icon = str_replace(array(DS, APP_WEB_DIR . '/'), array('/', ''), dirname($path));
	$icon = str_replace('Q/plugins/Calendars/', '{{Calendars}}', $icon);
	echo "[finalize] Icon path: {$icon}\n";
	
	$ok = AI_LLM::createStream(
		$streamType,
		$observationsType,
		array(
			'icon' => $icon
		),
		$attributes,
		array(
			'accept' => true // NOTE: we are assuming the LLM generates acceptable images here
		)
	);

	if ($ok) {
		echo "[finalize] Stream created successfully\n";
		$tempKey = 'tmp_' . uniqid('', true);
		echo "[finalize] Saving image with tempKey: {$tempKey}\n";
		$paths = Q_Image::save(array(
			'data' => $data,
			'path' => $icon,
			'subpath' => "",
			'save' => 'Streams/image',
			'skipAccess' => true
		));
		echo "[finalize] Image saved, unlinking temp file: {$path}\n";
		@unlink($path);
		echo "[finalize] Finalization complete\n";
	} else {
		echo "[finalize] ERROR: Stream creation failed for {$path}\n";
	}
}

function nextHolidayVersion($baseDir, $culture, $key, $year)
{
	$dir = $baseDir . DS . $culture . DS . $key;
	if (!is_dir($dir)) return 1;

	$max = 0;
	foreach (glob($dir . DS . $year . '-*', GLOB_ONLYDIR) as $d) {
		if (preg_match('/-(\d+)$/', $d, $m)) {
			$max = max($max, (int) $m[1]);
		}
	}
	return $max + 1;
}
