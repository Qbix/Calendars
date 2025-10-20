<?php
foreach (array("Calendars/calendar/main") as $template) {
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
$access->save(true);
echo "\n";
