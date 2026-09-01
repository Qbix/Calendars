<?php
	
function Calendars_0_4_5_1_Calendars()
{
	$events = Streams_Stream::select()->where(array(
		'type' => 'Calendars/event',
		'closedTime' => null
	))->fetchDbRows();

	foreach ($events as $event) {
		$rowExists = Calendars_Event::select("count(*) as res")->where(array(
			"publisherId" => $event->publisherId,
			"streamName" => $event->name
		))->execute()->fetchAll(PDO::FETCH_ASSOC)[0]["res"];
		if ($rowExists) {
			continue;
		}

		// save interests info to extended table
		$event->interests = Q::json_encode(Calendars_Event::getInterests($event));

		// save location info to extended table
		$location = Calendars_Event::getLocation($event);
		$event->location = $location ? Q::json_encode($location) : null;

		$event->save();
	}
}
Calendars_0_4_5_1_Calendars();