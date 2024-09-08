<?php

/**
 * Used to check out payment status for the event
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The id of the event's publisher
 * @param {string} [$params.eventId] Required. The id of the event.
 * @return void
 */
function Calendars_paymentStatus_post($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);
	$publisherId = $r['publisherId'];
	$streamName = 'Calendars/event/'.$r['eventId'];
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

	Q_Response::setSlot('payment', Assets_Credits::checkJoinPaid($user->id, $stream));
}