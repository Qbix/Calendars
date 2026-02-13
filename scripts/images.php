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
	'importance:'
));

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

$globalHolidays = json_decode(@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidays.json'), true);
$holidaysWithCountries = json_decode(@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidaysWithCountries.json'), true);
$countryLanguages = json_decode(@file_get_contents(PLACES_PLUGIN_CONFIG_DIR . DS . 'languages.json'), true);
$festivenessMap = json_decode(@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'festiveness.json'), true);
$holidayImportance = json_decode(@file_get_contents(CALENDARS_PLUGIN_CONFIG_DIR . DS . 'importance.json'), true);

if (!$globalHolidays || !$countryLanguages) {
	die("[error] Failed to load configs\n");
}

echo "[load] Loaded configs OK\n";

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
$batchCounts = array('image' => 0, 'llm' => 0);

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
for ($version = 1; $version <= $VERSIONS_MAX; $version++) {

	echo "[loop] version={$version}\n";

	foreach ($globalHolidays as $date => $entries) {

		if ($date < date("Y-m-d")) {
			continue;
		}

		echo "[date] {$date}\n";
		$year = substr($date, 0, 4);

		foreach ($entries as $entry) {
			foreach ($entry as $culture => $holidays) {
				foreach ($holidays as $holiday) {

					$key = Q_Utils::normalize($holiday);
					$tier = festivenessTier($key, $festivenessMap);
					$importance = Q::ifset($holidayImportance, $key, 0);

					if ($importance < $minImportance) {
						echo "[skip] {$holiday} importance={$importance}\n";
						continue;
					}

					echo "[holiday] {$holiday} ({$culture}) tier={$tier} importance={$importance}\n";

					foreach ($languages as $lang) {

						echo "[lang] {$lang}\n";

						$path = $langDir . DS . $size . '.' . $EXT;

						echo "[gen] {$path}\n";

						batchUse('image');

						$image->generate($prompt, $options);

						batchCommit('image');
					}
				}
			}
		}
		break 2;
	}
}

if ($BATCH_SIZE) {
	echo "[batch] final flush\n";
	Q_Utils::batchExecute('image');
	Q_Utils::batchExecute('llm');
}

echo "[done] Holiday image generation complete\n";

function processGeneratedImage($r, $path, $llm, $streamType, $observationsType, $attributes) {
	if (empty($r['data'])) {
		echo "[callback] empty image result\n";
		return;
	}

	echo "[callback] image generated -> {$path}\n";

	file_put_contents($path, $r['data']);

	if (!$llm) {
		echo "[callback] no llm, finalizing stream\n";
		finalizeStream($streamType, $observationsType, $path, $attributes, $r['data']);
		return;
	}

	batchUse('llm');

	echo "[llm] processing observations\n";

	$llm->process(
		array('images' => array($r['data'])),
		AI_LLM::observations($streamType, $observationsType),
		array(),
		array(
			'callback' => function ($results) use ($attributes, $streamType, $observationsType, $path, $data) {
				echo "[llm] observations complete\n";
				$attributes = array_merge(
					$attributes,
					AI_LLM::attributesFromObservationResults($results, $streamType, $observationsType)
				);
				finalizeStream($streamType, $observationsType, $path, $attributes, $data);
			}
		)
	);

	batchCommit('llm');
}

function finalizeStream($streamType, $observationsType, $path, $attributes, $data) {
	echo "[finalize] {$path}\n";

	$icon = str_replace(array(DS, APP_WEB_DIR . '/'), array('/', ''), dirname($path));

	$ok = AI_LLM::createStream(
		$streamType,
		$observationsType,
		array('icon' => $icon),
		$attributes,
		array('accept' => true)
	);

	if ($ok) {
		echo "[finalize] stream created, saving image\n";
		Q_Image::save(array(
			'data' => $data,
			'path' => $icon,
			'subpath' => "",
			'save' => 'Streams/image',
			'skipAccess' => true
		));
		@unlink($path);
	} else {
		echo "[finalize] stream creation failed\n";
	}
}
