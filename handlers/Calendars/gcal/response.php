<?php

function Calendars_gcal_response ()
{
	$eventId = Q_Dispatcher::uri()->eventId;
	$publisherId = Q_Dispatcher::uri()->publisherId;
	$streamName = "Calendars/event/$eventId";
	$timeZone = Q::ifset($_REQUEST, "timeZone", null);
	$stream = Streams_Stream::fetch(null, $publisherId, $streamName, true);
	$info = Calendars_Event::info($stream, $timeZone);
	$dates = "$info[start]/$info[end]";
	$params = array(
		// 'action' => 'TEMPLATE',
		'text' => $info['title'],
		'details' => "<a href='$info[url]'>$info[url]</a>\n\n$info[content]",
		'location' => $info['address'],
		'dates' => $dates,
		'url' => $info['url']
	);
	if (isset($info['timezoneName'])) {
		$params['ctz'] = $info['timezoneName'];
	}
	if (isset($info['videoconferenceUrl'])) {
		$params['videoconferenceUrl'] = $info['videoconferenceUrl'];
		if ($params['url'] !== $params['videoconferenceUrl']) {
			$details = "<a href='$info[url]'>$info[url]</a>"
				. "\n\n<a href='$info[videoconferenceUrl]'>$info[videoconferenceUrl]</a>"
				. "\n\n$info[content]";
		}
	}
	$redirect = 'https://calendar.google.com/calendar/r/eventedit?'
		. http_build_query($params, null, '&');
	Q_Response::redirect($redirect);
	return true;
}