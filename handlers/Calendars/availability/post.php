<?php

/**
 * @module Streams
 * @class HTTP Streams event
 */

/**
 * Used to plan a new Calendars/availability.
 * @method post
 *
 * @param {array} $_REQUEST
 * @optional
 */
function Calendars_availability_post($params)
{
	$data = array_merge($_REQUEST, $params);
	Q_Valid::requireFields(array("template", "timeSlots"), $data, true);

	$stream = Calendars_Availability::aggregate($data);

	Q_Response::setSlot('stream', $stream->exportArray());
}