<?php
function Calendars_availability_response_data($params) {
	$availabilityStreamName = Q::ifset($params, 'availability', 'streamName', Communities::requestedId($params, 'streamName'));
	$availabilityPublisherId = Q::ifset($params, 'availability', 'publisherId', Communities::requestedId($params, 'publisherId'));

	// get available slots from availability stream
	$availabilityStream = Streams_Stream::fetch(null, $availabilityPublisherId, $availabilityStreamName);
	if (!$availabilityStream) {
		throw new Exception("Calendars/availability stream not found");
	}
	$availableSlots = $availabilityStream->getAttribute('timeSlots');

	// minus time slots of events where max people reached
	$related = Streams_RelatedTo::select()->where(array(
		'toPublisherId' => $availabilityStream->publisherId,
		'toStreamName' => $availabilityStream->name,
		'type' => 'Calendars/event',
		'weight >' => time()
	))->fetchDbRows();
	foreach ($related as $item) {
		$extra = Q::json_decode($item->extra);
		$usedTimeSlot = Q::ifset($extra, 'timeSlots', null);
		if (!$usedTimeSlot) {
			continue;
		}

		$eventStream = Streams_Stream::fetch(null, $item->fromPublisherId, $item->fromStreamName);
		$participated = Streams_Participant::select("count(*) as res")->where(array(
			"streamName" => $item->fromStreamName,
			"extra like " => '%"going":"yes"%'
		))->execute()->fetchAll(PDO::FETCH_ASSOC)[0]["res"];

		if ($participated >= $eventStream->getAttribute("peopleMax")) {
			// remove used slot from available slots
			foreach ($availableSlots as $day => $timeSlots) {
				foreach ($timeSlots as $index => $timeSlot) {
					if ($timeSlot === Q::ifset($usedTimeSlot, $day, null)) {
						array_splice($availableSlots[$day], $index, 1);
					}
				}

			}
		}
	}

	return @compact("availableSlots");
}
