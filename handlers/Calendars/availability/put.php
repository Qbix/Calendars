<?php

/**
 * @module Streams
 * @class HTTP Streams event
 */

/**
 * Used to update Calendars/availability.
 * @method put
 *
 * @param {array} $_REQUEST
 * @optional
 */
function Calendars_availability_put($params)
{
	$data = array_merge($_REQUEST, $params);
	Q_Valid::requireFields(array("template", "timeSlots"), $data, true);

	$stream = Calendars_Availability::aggregate($data);

	Q_Response::setSlot('stream', $stream->exportArray());
}