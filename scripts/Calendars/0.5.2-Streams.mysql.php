<?php

foreach (["Users/owners", "Users/admins", "Calendars/admins", "Media/admins"] as $label) {
	$access = new Streams_Access();
	$access->publisherId = "";
	$access->streamName = "Calendars/event*";
	$access->ofContactLabel = $label;
	if ($access->retrieve()) {
		$access->addPermission("Places/location");
		$access->addPermission("Media/webrtc");
		$access->addPermission("Media/livestream");
		$access->addPermission("Media/presentation");
	} else {
		$access->permissions = '["Places/location", "Media/webrtc", "Media/livestream", "Media/presentation"]';
	}
	$access->readLevel = 40;
	$access->writeLevel = 23;
	$access->save(true);
}

foreach (["speaker", "leader", "host", "staff"] as $label) {
	$access = new Streams_Access();
	$access->publisherId = "";
	$access->streamName = "Calendars/event*";
	$access->ofParticipantRole = $label;
	if ($access->retrieve()) {
		$access->addPermission("Places/location");
		$access->addPermission("Media/webrtc");
		$access->addPermission("Media/livestream");
		$access->addPermission("Media/presentation");
	} else {
		$access->permissions = '["Places/location", "Media/webrtc", "Media/livestream", "Media/presentation"]';
	}
	$access->readLevel = 40;
	$access->writeLevel = 23;
	$access->save(true);
}

$access = new Streams_Access();
$access->publisherId = "";
$access->streamName = "Calendars/event*";
$access->ofParticipantRole = "attendee";
if ($access->retrieve()) {
	$access->addPermission("Places/location");
	$access->addPermission("Media/livestream");
} else {
	$access->permissions = '["Places/location", "Media/livestream"]';
}
$access->readLevel = 40;
$access->writeLevel = 23;
$access->save(true);
