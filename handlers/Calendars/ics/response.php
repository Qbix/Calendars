<?php

function Calendars_ics_response ()
{
	$method = Q_Dispatcher::uri()->method;
	$eventId = Q_Dispatcher::uri()->eventId;
	$publisherId = Q_Dispatcher::uri()->publisherId;
	$timeZone = Q::ifset($_REQUEST, "timeZone", null);
	$sequence = time();
	$streamName = "Calendars/event/$eventId";
	$stream = Streams_Stream::fetch(null, $publisherId, $streamName, true);
	$info = Calendars_Event::info($stream, $timeZone);
	$description = str_replace(array("\r\n", "\n"), array('\n', '\n'), $info['content']);
	$address = str_replace(',', '\,', $info['address']);
	$uid = $publisherId."_".$eventId;

	if ($method == "add") {
		$ics = <<<ICS
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:$uid
SEQUENCE:$sequence
DTSTAMP:$info[createdTime]
DTSTART:$info[start]
DTEND:$info[end]
URL:$info[url]
SUMMARY:$info[title]
DESCRIPTION:$description
LOCATION:$address
BEGIN:VALARM
TRIGGER:-PT60M
REPEAT:2
DURATION:PT30M
ACTION:DISPLAY
SUMMARY:$info[title]
DESCRIPTION:$description
END:VALARM
END:VEVENT
END:VCALENDAR
ICS;
	} elseif ($method == "delete") {
		$ics = <<<ICS
BEGIN:VCALENDAR
VERSION:2.0
METHOD:REQUEST
BEGIN:VEVENT
UID:$uid
SEQUENCE:$sequence
DTSTAMP:$info[createdTime]
DTSTART:$info[start]
SUMMARY:$info[title]
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR
ICS;
	}
$lb = <<<EOT


EOT;
	$linesIn = explode($lb, $ics);
	$linesOut = array();
	foreach ($linesIn as $l) {
		$lines = array();
		while (($len = strlen($l)) > 75) {
			$pos = strrpos($l, ' ', -($len-75));
			if ($pos !== false) {
				$pos = 75;
			}
			$lines[] = substr($l, 0, $pos);
			$l = substr($l, $pos);
		}
		$lines[] = $l;
		$linesOut[] = implode("\r\n ", $lines);
	}
	$ics = implode("\r\n", $linesOut);
	header('Content-type: text/calendar; charset=utf-8');
	header('Content-Disposition: inline; filename=event.ics');
	echo Q_Utils::lineBreaks($ics);
	return false;
}