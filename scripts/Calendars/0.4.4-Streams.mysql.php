<?php
	
function Calendars_0_4_4_Streams()
{
	$communityId = Users::communityId();

	if (empty(Streams_Stream::fetch($communityId, $communityId, "Calendars/calendar/main"))) {
		Streams::create($communityId, $communityId, 'Streams/category', array('name' => "Calendars/calendar/main"));
	}
	if (empty(Streams_Stream::fetch($communityId, $communityId, "Calendars/availabilities/main"))) {
		Streams::create($communityId, $communityId, 'Streams/category', array('name' => "Calendars/availabilities/main"));
	}
	echo "\n";

	// set permissions for Calendars/staff users
	$access = new Streams_Access();
	$access->publisherId = "";
	$access->streamName = "Calendars/availabilities/main";
	$access->ofContactLabel = "Calendars/staff";
	if (!$access->retrieve()) {
		$access->readLevel = 40;
		$access->writeLevel = 10;
		$access->save();
	}

	foreach (array("Calendars/availabilities/main", "Calendars/availability/") as $template) {
		foreach (array("Users/owners", "Users/admins", "Calendars/admins") as $role) {
			$access = new Streams_Access();
			$access->publisherId = "";
			$access->streamName = $template;
			$access->ofContactLabel = $role;
			if (!$access->retrieve()) {
				$access->readLevel = $access->writeLevel = $access->adminLevel = 40;
				$access->save();
			}
		}
	}
	echo "\n";

	echo "Adding Calendars/admins and Calendars/staff roles";
	Users_Label::addLabel("Calendars/admins", $communityId, "Calendars Admin", "{{Calendars}}/img/icons/Calendars/labels/admins", false);
	Users_Label::addLabel("Calendars/staff", $communityId, "Calendars Staff", "{{Calendars}}/img/icons/Calendars/labels/staff", false);

	// access stream for managing community roles
	$stream = new Streams_Stream();
	$stream->publisherId = $communityId;
	$stream->name = 'Streams/contacts';
	if ($stream->retrieve()) {
		$prefixes = $stream->getAttribute('prefixes', array());
		$prefixes[] = 'Calendars/';
		$stream->setAttribute('prefixes', $prefixes);
		$stream->save();
	}

	// access stream for managing community roles
	$stream = new Streams_Stream();
	$stream->publisherId = $communityId;
	$stream->name = 'Streams/labels';
	if ($stream->retrieve()) {
		$prefixes = $stream->getAttribute('prefixes', array());
		$prefixes[] = 'Calendars/';
		$stream->setAttribute('prefixes', $prefixes);
		$stream->save();
	}
	echo "\n";
}
Calendars_0_4_4_Streams();