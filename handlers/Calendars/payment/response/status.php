<?php
/**
 * Used to check out payment status for the event
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The id of the event's publisher
 * @param {string} [$params.eventId] Required. The id of the event.
 * @return void
 */
function Calendars_payment_response_status($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);
	$user = Users::loggedInUser(true);

	$stream = Streams_Stream::fetch($user->id, $r['publisherId'], 'Calendars/event/'.$r['eventId'], true);
	// if (!$stream->testWriteLevel('join')) {
	// 	throw new Users_Exception_NotAuthorized();
	// }

	return Assets_Credits::checkJoinPaid($user->id, $stream);
}