<?php
/**
 * Used to get payment info for event
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The id of the event's publisher
 * @param {string} [$params.eventId] Required. The id of the event.
 * @return void
 */
function Calendars_payment_response_info($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);

	$stream = Streams_Stream::fetch($r['publisherId'], $r['publisherId'], 'Calendars/event/'.$r['eventId'], true);

	return $stream->getAttribute("payment");
}