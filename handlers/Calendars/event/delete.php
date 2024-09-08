<?php

/**
 * @module Calendars
 * @class HTTP Calendars event
 */

/**
 * Close event stream
 * @method delete
 * @param {array} $_REQUEST
 * @param {string} [$_REQUEST.publisherId] Required. Event stream publisher id.
 * @param {string} [$_REQUEST.streamName] Required. Event stream name.
 * @param {string} [$_REQUEST.userId] Optional. User id request to close stream. Logged user by default.
 * @param {string} [$_REQUEST.stopRecurring] Optional. Pass true to also stop creating recurring events (and things associated to them).
 */
function Calendars_event_delete($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('streamName', 'publisherId');
	Q_Valid::requireFields($required, $r, true);
	$publisherId = $r['publisherId'];
	$streamName = $r['streamName'];

	$userId = Q::ifset($r, 'userId', Users::loggedInUser(true)->id);

	$stream = Streams_Stream::fetch($userId, $publisherId, $streamName);

	// check if user have permission to close stream (publisher or Community admin or app admin)
	if (!$stream->testWriteLevel('close')) {
		throw new Users_Exception_NotAuthorized();
	}

	// if recurring category exist - close one
	if (Q::ifset($_REQUEST, 'stopRecurring', false)) {
		$recurringCategory = Calendars_Recurring::fromStream($stream);
		if ($recurringCategory) {
			$recurringCategory->close($recurringCategory->publisherId);
		}
	}

	// set state to closed and send message to handle this event on client
	$stream->setAttribute("state", "closed");
	$stream->changed();

	// close stream
	$stream->close($publisherId);
}