<?php
function Calendars_availability_response_leave($params) {
	$availabilityPublisherId = Q::ifset($params, 'publisherId', Communities::requestedId($params, 'publisherId'));
	$availabilityStreamName = Q::ifset($params, 'streamName', Communities::requestedId($params, 'streamName'));
	$userId = Q::ifset($params, 'userId', Communities::requestedId($params, 'userId'));

	if (!$userId) {
		throw new Exception("Calendars/availability userId not found");
	}

	// get available slots from availability stream
	$availabilityStream = Streams_Stream::fetch(null, $availabilityPublisherId, $availabilityStreamName);
	if (!$availabilityStream) {
		throw new Exception("Calendars/availability stream not found");
	}

	// check current user permission
	if (!$availabilityStream->testWriteLevel('close')) {
		throw new Users_Exception_NotAuthorized();
	}

	$availabilityStream->leave(array(
		"userId" => $userId,
		"extra" => array("role" => "")
	));
}
