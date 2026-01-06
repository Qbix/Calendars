<?php
/**
 * handler for event Calendars/recurring/Calendars/event
 * Check whether new event need to create and create if yes.
 * Also participate users to new event.
 * @method Calendars_recurring_Calendars_event
 * @param {array} $params
 * @param {Streams_Stream} $params.relatedStream Recurring Event stream
 * @param {Streams_Stream} $params.recurringStream Recurring category stream
 * @return array|null Array of new events or null if error
 */
function Calendars_recurring_Calendars_event($params) {
	$eventStream = $params["relatedStream"];
	$recurringStream = $params["recurringStream"];

	if (!$eventStream instanceof Streams_Stream) {
		throw new Exception("Calendars_recurring_Calendars_event: relatedStream not a stream");
	}

	if (!$recurringStream instanceof Streams_Stream) {
		throw new Exception("Calendars_recurring_Calendars_event: recurringStream not a stream");
	}

	// special process for events related to availability
	$availabilityStream = $eventStream->related($eventStream->publisherId, false, array(
		"prefix" => "Calendars/availability/",
		'type' => "Calendars/event",
		'streamsOnly' => true
	));
	if (is_array($availabilityStream)) {
		$availabilityStream = reset($availabilityStream);
	}
	if ($availabilityStream instanceof Streams_Stream) {
		if (!empty($availabilityStream->closedTime)) {
			return null; // availability stream closed, nothing to do
		}

		$newEvents = Calendars_Availability::createEvents($availabilityStream, array("recurring" => false));
		foreach ($newEvents as $newEvent) {
			try {
				processRecurringEvent($newEvent, $recurringStream);
			} catch (Exception $e) {}
		}

		return $newEvents;
	}

	// get start time for UTC timezone
	$startTime = (int)$eventStream->getAttribute("startTime");
	$endTime = (int)$eventStream->getAttribute("endTime", 0);
	$timezoneName = $eventStream->getAttribute("timezoneName") ?: "UTC";

	// get current timestamp for timezone
	$date_timezone = (new DateTime(null, new DateTimeZone($timezoneName)))->getTimestamp();

	// check if event started
	// if not - this event is next recurring event
	if ($date_timezone < $startTime) {
		return $eventStream;
	}

	/************ CREATE NEW EVENT **********/

	// set current logged user to event publisher to create event
	Users::setLoggedInUser($eventStream->publisherId);

	// recurring info
	// IMPORTANT: recurringCategory should be inside this attribute
	// otherwise new recurring category will be created
	$recurringInfo = $recurringStream->getAllAttributes();
	// IMPORTANT: set current recurring category info. Otherwise new recurring category will created.
	$recurringInfo['recurringCategory'] = $recurringStream;
	// don't participate event publisher to new event
	// will participate it later if user participated to recurring category
	$recurringInfo['skipParticipating'] = true;

	$newStartTime = Calendars_Recurring::calculateTime($startTime, $recurringInfo);

	// if for some reason new start date didn't calculated - need to log this
	// return this method (not throw Exception) to allow further events processing
	if (!$newStartTime) {
		return null;
	}

	// get place id from location last part
	$location = Places_Location::fromStream($eventStream);
	$placeId = explode('/', $location['name']);
	$placeId = end($placeId);

	$areaSelected = Q::ifset($location, "area", null);

	// collect all interests titles
	$interestsTitles = array();
	foreach (Calendars_Event::getInterests($eventStream) as $interest) {
		$interestsTitles[] = Q::ifset($interest, 'title', null);
	}

	// create event
	$fields = array(
		"interestTitle" => $interestsTitles,
		"placeId" => $placeId,
		"areaSelected" => $areaSelected,
		"startTime" => $newStartTime,
		"timezoneName" => $timezoneName,
		"labels" => $eventStream->getAttribute("labels"),
		"asUserId" => $eventStream->publisherId,
		"communityId" => $eventStream->getAttribute("communityId"),
		"publisherId" => $eventStream->publisherId,
		"peopleMin" => $eventStream->getAttribute("peopleMin"),
		"peopleMax" => $eventStream->getAttribute("peopleMax"),
		"experienceId" => null,
		"recurring" => $recurringInfo,
		"icon" => $eventStream->icon
	);
	if ($endTime) {
		$fields['endTime'] = $newStartTime + ($endTime - $startTime); // assume same duration
	}

	$newEvent = Calendars_Event::create($fields, true);

	processRecurringEvent ($newEvent, $recurringStream);

	// if no new event created - exit
	if (!($newEvent instanceof Streams_Stream)) {
		return null;
	}

	return array($newEvent);
}

function processRecurringEvent ($newEvent, $recurringStream) {
	$location = json_decode($newEvent->location);

	$timeZone = Q::ifset($location, "timeZone", $newEvent->getAttribute("timezoneName"));

	// hours:minutes when event start
	$startDate = (new DateTime("now", new DateTimeZone($timeZone)))->setTimestamp((int)$newEvent->getAttribute("startTime"));

	$startTime = $startDate->format('H:i');

	// week day when event will start
	$weekDay = $startDate->format('D');

	// month day when event will start
	$monthDay = $startDate->format('j');

	/***** SEARCH RELATED RECURRING TRIPS AND CREATE NEW AND RELATE TO CURRENT EVENT *****/
	// get related trips recurring categories
	$relatedTripsRecurringCategories = Streams::related(
		$recurringStream->publisherId,
		$recurringStream->publisherId,
		$recurringStream->name,
		true,
		array(
			"type" => "Travel/trip",
			"streamsOnly" => true
		)
	);

	foreach($relatedTripsRecurringCategories as $recurringTripCategory){
		$tripRecurringDays = $recurringTripCategory->getAttribute("days") ?: array();

		// if trips recurring days don't contain new event day - skip
		if (!in_array($weekDay, $tripRecurringDays) && !in_array($monthDay, $tripRecurringDays)) {
			continue;
		}

		// get last recurring trip related to this category
		$lastRecurringTrip = Calendars_Recurring::getLastStream($recurringTripCategory);

		// execute event to create next trip or return already created trip (if next trip created before this event)
		$newTrip = Q::event('Calendars/recurring/Travel/trip', array(
			'relatedStream' => $lastRecurringTrip,
			'recurringStream' => $recurringTripCategory,
			'relateToEvent' => $newEvent
		));

		// may be new trip already created
		// then relate last created recurring trip to this new recurring event
		if ($newTrip instanceof Streams_Stream && class_exists('Travel_Trip')) {
			Travel_Trip::relateTo($newTrip, $newEvent);
		}
	}

	/************ JOIN USERS TO NEW EVENT **********/
	// get all recurring participants
	$participants = Streams_Participant::select()->where(array(
		'state' => "participating",
		"publisherId" => $recurringStream->publisherId,
		"streamName" => $recurringStream->name
	))->fetchDbRows();

	$recurringDays = $recurringStream->getAttribute("days");

	foreach ($participants as $participant) {
		if (empty($participant->extra)) {
			continue;
		}

		$extra = Q::json_decode($participant->extra);

		if (!empty($extra->startDate) && strtotime($extra->startDate) > time()) {
			continue;
		}
		if (!empty($extra->endDate) && strtotime($extra->endDate) < time()) {
			continue;
		}

		// if user going that day - join him to event
		if (Q::ifset($extra->days, $weekDay, false) !== false || Q::ifset($extra->days, $monthDay, false) !== false) {
			// if time slots not empty check if user subscribed to time slots
			if (is_array($recurringDays[$weekDay]) && sizeof($recurringDays[$weekDay])) {
				$found = false;
				foreach ($extra->days->$weekDay as $timeSlot) {
					if (ltrim($timeSlot[0], '0') == ltrim($startTime, '0')) {
						$found = true;
					}
				}

				if (!$found) {
					continue;
				}
			}

			// set current logged user to participant
			Users::setLoggedInUser($participant->userId);

			// join user to event with autoCharge option
			Calendars_Event::going($newEvent, $participant->userId, 'yes', array(
				"autoCharge" => true,
				"relatedParticipants" => Q::ifset($extra, "relatedParticipants", array())
			));
		}
	}
}