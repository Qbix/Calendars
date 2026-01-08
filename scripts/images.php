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
$BATCH_SIZE = (int) Q_Config::get('AI', 'images', 'batch', 1);
if ($BATCH_SIZE <= 1) {
	$BATCH_SIZE = 0;
}

/**
 * CLI options
 */
$opts = getopt('', array(
	'size:',
	'orientation:',
	'ideogram',
	'google',
	'openai',
	'text'
));

$useIdeogram = isset($opts['ideogram']);
$useGoogle   = isset($opts['google']);
$useOpenAI   = isset($opts['openai']);
$allowText   = isset($opts['text']);

/**
 * Default: Ideogram + text
 */
if (!$useIdeogram && !$useGoogle && !$useOpenAI) {
	$useIdeogram = true;
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
$countryLanguages = json_decode(
	@file_get_contents(PLACES_PLUGIN_CONFIG_DIR . DS . 'languages.json'),
	true
);
$festivenessMap = json_decode(
	@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'festiveness.json'),
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
$allLanguages = array('ru', 'uk', 'en');

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
	$modelBias // 'ideogram' | 'google' | 'openai'
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
	if ($modelBias === 'openai') {
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
 * Translation prompt (OpenAI edit)
 */
function translationPrompt($language)
{
	return
		"Replace the visible holiday greeting text with correct {$language}.\n" .
		"Use standard, well-known holiday phrases.\n" .
		"Preserve layout, colors, lighting, and composition.\n" .
		"Do not alter the scene.";
}

/**
 * Adapters
 */
$ideogram = AI_Image::create('ideogram');
$google   = AI_Image::create('google');
$openai   = AI_Image::create('openai');

if (!$ideogram || !$google || !$openai) {
	die("Missing adapters\n");
}

/**
 * Batch helpers
 */
$batchCount = 0;
function batchStart(&$c, $n) {
	if ($n && $c === 0) Q_Utils::batchStart();
}
function batchFlush(&$c, $n) {
	if ($n && $c >= $n) {
		Q_Utils::batchExecute();
		$c = 0;
	}
}

/**
 * MAIN LOOP
 */
for ($index = 1; $index <= $MAX_INDEX; $index++) {

	foreach ($globalHolidays as $date => $entries) {

		$year = substr($date, 0, 4);

		foreach ($entries as $entry) {
			foreach ($entry as $culture => $holidays) {
				foreach ($holidays as $holiday) {

					$key = Q_Utils::normalize($holiday);
					$tier = festivenessTier($key, $festivenessMap);

					foreach ($allLanguages as $lang) {

						$langInfo = Q_Text::languagesInfo();
						if (empty($langInfo[$lang]['name'])) continue;

						$outDir = APP_FILES_DIR . DS . 'Calendars' . DS . 'holidays'
							. DS . $culture . DS . $key . DS . $year . '-' . $index;

						if (!is_dir($outDir)) mkdir($outDir, 0755, true);

						$path = $outDir . DS . $lang . '.' . $EXT;
						if (file_exists($path)) continue;

						$scene    = $SCENES[$tier][array_rand($SCENES[$tier])];
						$template = $TEMPLATES[$tier][array_rand($TEMPLATES[$tier])];

						$modelBias =
							$useOpenAI ? 'openai' :
							($useGoogle ? 'google' : 'ideogram');

						$prompt = generatePrompt(
							$culture,
							$holiday,
							$langInfo[$lang]['name'],
							$scene,
							$template,
							$orientation,
							$allowText,
							$modelBias
						);

						batchStart($batchCount, $BATCH_SIZE);

						/* Ideogram only (default) */
						if ($useIdeogram && !$useGoogle && !$useOpenAI) {
							$ideogram->generate($prompt, array(
								'format' => $EXT,
								'width'  => $width,
								'height' => $height,
								'callback' => function ($r) use ($path) {
									if (!empty($r['data'])) {
										file_put_contents($path, $r['data']);
									}
								}
							));
							$batchCount++;
							batchFlush($batchCount, $BATCH_SIZE);
							continue;
						}

						/* Google only */
						if ($useGoogle && !$useOpenAI) {
							$google->generate($prompt, array(
								'format' => $EXT,
								'width'  => $width,
								'height' => $height,
								'size'   => $size,
								'callback' => function ($r) use ($path) {
									if (!empty($r['data'])) {
										file_put_contents($path, $r['data']);
									}
								}
							));
							$batchCount++;
							batchFlush($batchCount, $BATCH_SIZE);
							continue;
						}

						/* OpenAI only */
						if ($useOpenAI && !$useGoogle) {
							$openai->generate($prompt, array(
								'format'  => $EXT,
								'width'   => $width,
								'height'  => $height,
								'size'    => $size,
								'quality' => 'hd',
								'callback' => function ($r) use ($path) {
									if (!empty($r['data'])) {
										file_put_contents($path, $r['data']);
									}
								}
							));
							$batchCount++;
							batchFlush($batchCount, $BATCH_SIZE);
							continue;
						}

						/* Google → OpenAI (text correction) */
						if ($useGoogle && $useOpenAI && $allowText) {
							$google->generate($prompt, array(
								'format' => 'png',
								'width'  => $width,
								'height' => $height,
								'size'   => $size,
								'callback' => function ($r) use (
									$openai, $langInfo, $lang, $path,
									$width, $height, $size, $EXT
								) {
									if (empty($r['data'])) return;

									$tmp = tempnam(sys_get_temp_dir(), 'img_') . '.png';
									file_put_contents($tmp, $r['data']);

									$openai->generate(
										translationPrompt($langInfo[$lang]['name']),
										array(
											'images'  => array(file_get_contents($tmp)),
											'format'  => $EXT,
											'width'   => $width,
											'height'  => $height,
											'size'    => $size,
											'quality' => 'hd',
											'callback' => function ($res) use ($path, $tmp) {
												if (!empty($res['data'])) {
													file_put_contents($path, $res['data']);
												}
												@unlink($tmp);
											}
										)
									);
								}
							));
							$batchCount += 2;
							batchFlush($batchCount, $BATCH_SIZE);
						}
					}
				}
			}
		}
		break;
	}
}

if ($BATCH_SIZE && $batchCount > 0) {
	Q_Utils::batchExecute();
}

echo "Holiday image generation complete.\n";