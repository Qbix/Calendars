<?php

function Calendars_outlook_response ()
{
	$eventId = Q_Dispatcher::uri()->eventId;
	$publisherId = Q_Dispatcher::uri()->publisherId;
	$streamName = "Calendars/event/$eventId";
	$timeZone = Q::ifset($_REQUEST, "timeZone", null);
	$stream = Streams_Stream::fetch(null, $publisherId, $streamName, true);
	$info = Calendars_Event::info($stream, $timeZone);

	// Outlook expects ISO 8601: 2026-07-10T14:00:00Z
	// info() may return compact gcal format (20260710T140000Z),
	// a strtotime-parseable string, or a unix timestamp.
	$startDt = _Calendars_outlook_toISO($info['start']);
	$endDt = _Calendars_outlook_toISO($info['end']);
	if (!$endDt) {
		// fallback: 2 hours after start
		$startTs = _Calendars_outlook_toTimestamp($info['start']);
		$endDt = gmdate('Y-m-d\TH:i:s\Z', $startTs + 7200);
	}
	if (!$startDt) {
		$startDt = gmdate('Y-m-d\TH:i:s\Z', time());
	}

	$body = "$info[url]\n\n$info[content]";
	if (isset($info['videoconferenceUrl'])
		&& $info['url'] !== $info['videoconferenceUrl']
	) {
		$body = "$info[url]\n\n$info[videoconferenceUrl]\n\n$info[content]";
	}

	$params = array(
		'path' => '/calendar/action/compose',
		'rru' => 'addevent',
		'subject' => $info['title'],
		'body' => $body,
		'location' => $info['address'],
		'startdt' => $startDt,
		'enddt' => $endDt
	);

	$redirect = 'https://outlook.live.com/calendar/0/deeplink/compose?'
		. http_build_query($params, '', '&');
	Q_Response::redirect($redirect);
	return true;
}

/**
 * Try to convert a date value to ISO 8601 (2026-07-10T14:00:00Z).
 * Handles compact gcal format, strtotime-parseable strings, and unix timestamps.
 * @param mixed $value
 * @return string|null ISO 8601 string or null on failure
 */
function _Calendars_outlook_toISO($value)
{
	if (!$value) {
		return null;
	}
	// compact gcal format: 20260710T140000Z
	$dt = DateTime::createFromFormat('Ymd\THis\Z', $value, new DateTimeZone('UTC'));
	if ($dt) {
		return $dt->format('Y-m-d\TH:i:s\Z');
	}
	// already ISO 8601 or other strtotime-parseable string
	$ts = strtotime($value);
	if ($ts) {
		return gmdate('Y-m-d\TH:i:s\Z', $ts);
	}
	// raw unix timestamp
	if (is_numeric($value)) {
		return gmdate('Y-m-d\TH:i:s\Z', (int)$value);
	}
	return null;
}

/**
 * Convert a date value to a unix timestamp, trying the same formats as above.
 * @param mixed $value
 * @return int unix timestamp, or current time on failure
 */
function _Calendars_outlook_toTimestamp($value)
{
	if (!$value) {
		return time();
	}
	$dt = DateTime::createFromFormat('Ymd\THis\Z', $value, new DateTimeZone('UTC'));
	if ($dt) {
		return $dt->getTimestamp();
	}
	$ts = strtotime($value);
	if ($ts) {
		return $ts;
	}
	if (is_numeric($value)) {
		return (int)$value;
	}
	return time();
}