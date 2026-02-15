#!/usr/bin/env php
<?php

set_time_limit(0);

$FROM_APP = defined('RUNNING_FROM_APP');
$argv = $_SERVER['argv'];
$count = count($argv);

$usage = "Usage: php {$argv[0]} " . ($FROM_APP ? '' : '<app_root>');
if (!$FROM_APP) {
	$usage .= "\n\n<app_root> must be a path to the application root directory";
}

$help = <<<EOT
$usage

Fetches holiday data via Nager.Date and produces canonical holiday files:
- text/Calendars/holidays/en.json (English display strings)
- config/holidays/CC.json (canonical, normalized)

EOT;

if (isset($argv[1]) && in_array($argv[1], array('--help', '-h', '/?', '-?'))) {
	die($help);
}

if (!$FROM_APP && $count < 2) {
	die($usage);
}

if (!$FROM_APP) {
	define('APP_DIR', realpath($argv[1]));
	define('RUNNING_FROM_APP', APP_DIR);
}

require_once(APP_DIR . '/scripts/Q.inc.php');

/* ------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

function formatHolidayJson($json)
{
	$json = str_replace('},{', '}, {', $json);
	$json = preg_replace('/,"(\d{4}-\d{2}-\d{2})":/', ",\n  \"$1\":", $json);
	$json = preg_replace('/^\{/', "{\n  ", $json);
	$json = preg_replace('/\}$/', "\n}", $json);
	return $json;
}

/* ------------------------------------------------------------
 * Directories
 * ------------------------------------------------------------ */

$textDir = CALENDARS_PLUGIN_TEXT_DIR . DS . 'Calendars' . DS . 'holidays';
if (!file_exists($textDir)) mkdir($textDir, 0777, true);

$configDir = CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidays';
if (!file_exists($configDir)) mkdir($configDir, 0777, true);

/* ------------------------------------------------------------
 * Load en.json
 * ------------------------------------------------------------ */

$mergedFile = $textDir . DS . 'en.json';
$merged = file_exists($mergedFile)
	? json_decode(file_get_contents($mergedFile), true)
	: array();

/* ------------------------------------------------------------
 * Load authoritative global holidays
 * ------------------------------------------------------------ */

$knownByDate = array();
$knownFile = CALENDARS_PLUGIN_CONFIG_DIR . DS . 'holidays.json';

if (file_exists($knownFile)) {
	$tmp = json_decode(file_get_contents($knownFile), true);
	if (is_array($tmp)) {
		foreach ($tmp as $date => $entries) {
			foreach ($entries as $entry) {
				foreach ($entry as $culture => $names) {
					foreach ($names as $name) {
						$norm = Q_Utils::normalize($name);
						$knownByDate[$date][] = array(
							'culture' => $culture,
							'name'    => $name,
							'norm'    => $norm
						);
						if (!isset($merged[$norm])) {
							$merged[$norm] = $name;
						}
					}
				}
			}
		}
	}
}

/* ------------------------------------------------------------
 * Country list
 * ------------------------------------------------------------ */

$json = @file_get_contents(
	PLACES_PLUGIN_CONFIG_DIR . DS . 'countries' . DS . 'apple.json'
);

$countryCodes = $json ? json_decode($json, true) : array();

/* ------------------------------------------------------------
 * Main loop
 * ------------------------------------------------------------ */

$years = array(date('Y'), date('Y') + 1);

foreach ($countryCodes as $code) {

	$outFile = $configDir . DS . $code . '.json';
	if (file_exists($outFile)) continue;

	$byDate = array();

	foreach ($years as $year) {

		$json = @file_get_contents(
			"https://date.nager.at/api/v3/PublicHolidays/$year/$code"
		);
		if (!$json) continue;

		$holidays = json_decode($json, true);
		if (!is_array($holidays)) continue;

		foreach ($holidays as $h) {

			$date    = $h['date'];
			$english = $h['name'];

			$norm = Q_Utils::normalize($english);

			// Always add National (ENGLISH CANONICAL)
			$byDate[$date][] = array(
				'National' => array($norm)
			);

			if (!isset($merged[$norm])) {
				$merged[$norm] = $english;
			}

			// Optional global match
			if (!isset($knownByDate[$date])) continue;

			$best = null;
			$bestPct = 0;

			foreach ($knownByDate[$date] as $candidate) {
				similar_text($norm, $candidate['norm'], $pct);
				if ($pct > $bestPct) {
					$bestPct = $pct;
					$best = $candidate;
				}
			}

			if ($best && $bestPct > 40) {
				$byDate[$date][] = array(
					$best['culture'] => array($best['norm'])
				);

				if (!isset($merged[$best['norm']])) {
					$merged[$best['norm']] = $best['name'];
				}
			}
		}
	}

	if (!empty($byDate)) {
		ksort($byDate);
		$raw = json_encode($byDate, JSON_UNESCAPED_UNICODE);
		file_put_contents($outFile, formatHolidayJson($raw));
		echo "Saved $code — " . count($byDate) . " dates\n";
	}
}

/* ------------------------------------------------------------
 * Save en.json
 * ------------------------------------------------------------ */

ksort($merged);
file_put_contents(
	$mergedFile,
	json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
);

echo "Merged file updated: en.json with " . count($merged) . " entries\n";
