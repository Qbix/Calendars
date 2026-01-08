#!/usr/bin/env php
<?php

if (!defined('RUNNING_FROM_APP')) {
	die("This script must be run from an app context.\n");
}

set_time_limit(0);

/**
 * CONFIG
 */
$MAX_INDEX    = 1000;
$EXT          = 'jpg';
$FALLBACK_EXT = 'png';

/**
 * Batch config
 */
$BATCH_SIZE = (int) Q_Config::get('AI', 'images', 'batch', 10);
if ($BATCH_SIZE <= 1) {
	$BATCH_SIZE = 0;
}

/**
 * CLI options
 */
$opts = getopt('', array(
	'size:',
	'orientation:'
));

/**
 * Resolve size / orientation
 */
$orientation = isset($opts['orientation'])
	? strtolower($opts['orientation'])
	: 'square';

$width  = 1024;
$height = 1024;

if (!empty($opts['size']) && preg_match('/^(\d+)x(\d+)$/', $opts['size'], $m)) {
	$width  = (int) $m[1];
	$height = (int) $m[2];
} else {
	switch ($orientation) {
		case 'portrait':
			$width = 1024; $height = 1536; break;
		case 'landscape':
			$width = 1536; $height = 1024; break;
		default:
			$width = 1024; $height = 1024; break;
	}
}
$size = "{$width}x{$height}";

/**
 * Load configs
 */
$globalHolidaysFile = CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidays.json';
$languagesFile      = PLACES_PLUGIN_CONFIG_DIR . DS . 'languages.json';
$festivenessFile    = CALENDARS_PLUGIN_CONFIG_DIR . DS . 'festiveness.json';

$globalHolidays   = json_decode(@file_get_contents($globalHolidaysFile), true);
$countryLanguages = json_decode(@file_get_contents($languagesFile), true);
$festivenessMap   = json_decode(@file_get_contents($festivenessFile), true);

if (!$globalHolidays || !$countryLanguages) {
	die("Failed to load holiday or language config\n");
}

/**
 * Collect all unique languages
 */
$allLanguages = array();
foreach ($countryLanguages as $langs) {
	if (!is_array($langs)) continue;
	foreach ($langs as $lang) {
		$allLanguages[$lang] = true;
	}
}
$allLanguages = array_keys($allLanguages);

/**
 * Scene templates by festiveness tier
 */
$SCENES = array(
	'somber' => array(
		'a solemn ceremonial scene with restrained motion, symbolic objects, and reverent atmosphere',
		'a quiet commemorative composition with low movement, controlled lighting, and dignified presence',
		'a reflective painterly scene centered on remembrance, history, or collective memory'
	),
	'universal' => array(
		'an ornate cultural scene featuring traditional objects, textiles, and symbolic elements',
		'a richly detailed cultural environment emphasizing craftsmanship, materials, and atmosphere',
		'a layered painterly composition inspired by fine art and historical poster traditions'
	),
	'festive' => array(
		'a vivid celebratory scene filled with light, motion, decorative elements, and visual energy',
		'a joyful composition combining cultural motifs, patterns, and dramatic lighting',
		'a richly ornamented festive environment with celebration, music, gathering, or ritual'
	)
);

/**
 * Prompt templates by festiveness tier
 */
$TEMPLATES = array(
	'somber' => array(
		'Respectful commemorative image for {{culture}} holiday: {{holiday}}. {{scene}}.
		Serious, dignified tone. Emotionally restrained. Text in {{language}}.',
		'Memorial-style photo for {{culture}} {{holiday}}. {{scene}}.
		Subdued energy, controlled color, reverent mood. Text in {{language}}.'
	),
	'universal' => array(
		'Highly detailed cultural image for {{culture}} holiday: {{holiday}}. {{scene}}.
		Balanced emotional tone, rich visual detail. Text in {{language}}.',
		'Artistic holiday illustration for {{culture}} {{holiday}}. {{scene}}.
		Ornate, painterly, culturally expressive. Text in {{language}}.'
	),
	'festive' => array(
		'Vibrant celebratory image for {{culture}} holiday: {{holiday}}. {{scene}}.
		High energy, joyful atmosphere, luminous color. Text in {{language}}.',
		'Festive holiday photo for {{culture}} holiday: {{holiday}}. {{scene}}.
		Dynamic composition, exuberant decoration, celebratory mood. Text in {{language}}.'
	)
);

/**
 * Determine festiveness tier
 */
function festivenessTier($holidayKey, $festivenessMap)
{
	if (!isset($festivenessMap[$holidayKey])) {
		return 'universal';
	}
	$v = (int) $festivenessMap[$holidayKey];
	if ($v <= 3) return 'somber';
	if ($v <= 6) return 'universal';
	return 'festive';
}

/**
 * Generate prompt
 */
function generatePrompt($culture, $holiday, $languageName, $scene, $template, $orientation)
{
	$prompt = str_replace(
		array('{{culture}}', '{{holiday}}', '{{scene}}', '{{language}}'),
		array($culture, $holiday, $scene, $languageName),
		$template
	);

	switch ($orientation) {
		case 'portrait':  $prompt .= ' Vertical composition.'; break;
		case 'landscape': $prompt .= ' Wide cinematic composition.'; break;
		default:          $prompt .= ' Balanced square composition.'; break;
	}

	$prompt .= <<<EOT
It should feature a prominent, appropriate and personal greeting for the holiday, in the form of a title and a subtitle.
This is intended to be sent by people to each other for this holiday.
High detail. No flat illustration. No cartoon style. Ornate and beautiful.
Dense decorative detail, layered textures, intricate patterns, and expressive lighting.
Cinematic depth, visible brush texture, ornamental framing, and dramatic color harmony.
No minimalism. No flat vector art.
Very important: No Studio Ghibli style. No storybook illustration. No pastel children's art.
EOT;

	return $prompt;
}

/**
 * Image adapter
 */
$imageAdapter = AI_Image::create('openai');
if (!$imageAdapter) {
	die("OpenAI image adapter not available\n");
}

/**
 * Batch helpers
 */
$batchCount = 0;

function batchStartIfNeeded(&$batchCount, $BATCH_SIZE)
{
	if ($BATCH_SIZE && $batchCount === 0) {
		Q_Utils::batchStart();
	}
}

function batchFlushIfNeeded(&$batchCount, $BATCH_SIZE)
{
	if ($BATCH_SIZE && $batchCount >= $BATCH_SIZE) {
		Q_Utils::batchExecute();
		$batchCount = 0;
	}
}

/**
 * MAIN LOOP
 * Index-first, deterministic, idempotent
 */
for ($index = 1; $index <= $MAX_INDEX; $index++) {

	foreach ($globalHolidays as $date => $entries) {

		$year = substr($date, 0, 4);

		foreach ($entries as $entry) {
			foreach ($entry as $culture => $holidays) {
				foreach ($holidays as $holidayName) {

					$holidayKey = Q_Utils::normalize($holidayName);
					$tier = festivenessTier($holidayKey, $festivenessMap);

					foreach ($allLanguages as $lang) {

						$langInfo = Q_Text::languagesInfo();
						if (empty($langInfo[$lang]['name'])) continue;

						$outDir = APP_FILES_DIR . DS . 'Calendars' . DS . 'holidays'
                            . DS . $culture
							. DS . $holidayKey
							. DS . "$year-$index";

						$path = $outDir . DS . "$lang.$EXT";

						// Skip if already generated
						if (file_exists($path)) {
							continue;
						}

						if (!is_dir($outDir)) {
							mkdir($outDir, 0755, true);
						}

						$scene    = $SCENES[$tier][array_rand($SCENES[$tier])];
						$template = $TEMPLATES[$tier][array_rand($TEMPLATES[$tier])];

						$prompt = generatePrompt(
                            $culture,
							$holidayName,
							$langInfo[$lang]['name'],
							$scene,
							$template,
							$orientation
						);

						batchStartIfNeeded($batchCount, $BATCH_SIZE);

						$imageAdapter::generate($prompt, array(
							'format'   => $EXT,
							'width'    => $width,
							'height'   => $height,
							'size'     => $size,
							'quality'  => 'hd',
							'callback' => function ($result) use ($path, $holidayName, $lang) {
								if (!empty($result['data'])) {
									file_put_contents($path, $result['data']);
									echo "Generated $path\n";
								} else {
									echo "Failed $holidayName ($lang)\n";
								}
							}
						));

						$batchCount++;
						batchFlushIfNeeded($batchCount, $BATCH_SIZE);
					}
				}
			}
		}
	}
}

/**
 * Final batch flush
 */
if ($BATCH_SIZE && $batchCount > 0) {
	Q_Utils::batchExecute();
}

echo "Holiday image generation complete.\n";
