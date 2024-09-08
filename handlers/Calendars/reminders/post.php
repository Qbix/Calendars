<?php
/**
 * Used to change the "reminders" of event participant
 *
 * @param {array} $params 
 * @param {string} $params.publisherId The id of the event's publisher
 * @param {string} $params.eventId The id of the event.
 * @param {string} $params.reminders Array of times in seconds to remind
 * @return void
 */
function Calendars_reminders_post($params) {
	$r = array_merge($_REQUEST, $params);
	$required = array('reminders', 'eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);
	$publisherId = $r['publisherId'];
	$streamName = 'Calendars/event/'.$r['eventId'];
	$user = Users::loggedInUser(true);

	$participant = new Streams_Participant();
	$participant->publisherId = $publisherId;
	$participant->streamName = $streamName;
	$participant->userId = $user->id;
	$participant->state = "participating";
	if(!$participant->retrieve()) {
		throw new Exception('User not participated');
	}
	$participant->setExtra(array("reminders" => $r['reminders']));
	$participant->save();

	Q_Response::setSlot('participant', $participant);
}
