<?php

/**
 * Used to change the "going" status in an event
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The id of the event's publisher
 * @param {string} [$params.eventId] Required. The id of the event.
 * @param {string} [$params.going] Required. Can be one of "no", "maybe" or "yes"
 */
function Calendars_going_post($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('going', 'eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);
	$publisherId = $r['publisherId'];
	$streamName = 'Calendars/event/'.$r['eventId'];
	$going = $r['going'];
	$values = array('no', 'yes', 'maybe');
	if (!in_array($going, $values)) {
		throw new Q_Exception_WrongValue(array(
			'field' => 'going',
			'range' => 'no, yes or maybe'
		));
	}
	$prefix = 'Calendars/event/';
	if (substr($streamName, 0, strlen($prefix)) !== $prefix) {
		throw new Q_Exception_WrongValue(array(
			'field '=> 'stream name',
			'range' => 'something beginning with Calendars/event/'
		));
	}
	$user = Users::loggedInUser(true);
	$stream = Streams_Stream::fetch($user->id, $publisherId, $streamName, true);
	if (!$stream->testWriteLevel('join')) {
		throw new Users_Exception_NotAuthorized();
	}

	$location = Places_Location::fromStream($stream);
	$endTime = $stream->getAttribute('endTime');
	$text = Q_Text::get("Calendars/content");
	switch ($going) {
		case 'no':
			// user can't leave ended event
			if ($endTime < time()) {
				throw new Exception($text["event"]["ErrorLeaveEndedEvent"]);
			}

			//--check if participated in trips--
			$relatedTrips = $stream->related($user->id, "Travel/trip");
			foreach($relatedTrips[1] as $tripStream){
				$participant = new Streams_Participant();
				$participant->publisherId = $tripStream->publisherId;
				$participant->streamName = $tripStream->name;
				$participant->userId = $user->id;
				$participant->state = "participating";
				if($participant->retrieve() && $participant->getExtra("going") == "yes") {
					throw new Exception('You are taking part in rides to and from "'.Q::ifset($location, "venue", null).'".');
				}
			}
			//----------------------------------

			$participant = Calendars_Event::going($stream, $user->id, 'no');
			break;
		case 'maybe':
			$participant = Calendars_Event::going($stream, $user->id, $going);
			break;
		case 'yes':
			$participant = Calendars_Event::going($stream, $user->id, $going, array("autoCharge" => true));
			break;
	}

	Q_Response::setSlot('stream', $stream->exportArray());
	Q_Response::setSlot('participant', $participant->exportArray());
	Q_Response::setSlot('payment', $participant->get('paymentIntent', false));
	Q_Response::setSlot('paid', $participant->get('paid', false));
}
