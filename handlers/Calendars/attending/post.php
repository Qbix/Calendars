<?php

/**
 * Check a participant in to an event from the attendance sheet, or undo it.
 *
 * Writes the same roles Calendars/checkin does: "attendee" when they're
 * checked in, or "arrived" when the event requires payment, they haven't
 * paid, and the person marking them isn't an admin who can approve it.
 *
 * @class HTTP Calendars attending
 * @method POST
 * @static
 * @param {array} $_REQUEST
 * @param {string} $_REQUEST.publisherId Event publisher
 * @param {string} $_REQUEST.eventId Last part of the event stream name
 * @param {string} $_REQUEST.userId User we are checking in
 * @param {boolean} [$_REQUEST.attending=true] Pass 0 to undo
 */
function Calendars_attending_post($params)
{
	$req = array_merge($_REQUEST, $params);
	Q_Valid::requireFields(array(
		'publisherId', 'eventId', 'userId'
	), $req, true);

	$currentUser = Users::loggedInUser(true);
	$userId = $req['userId'];

	$attending = true;
	if (isset($req['attending'])) {
		$a = $req['attending'];
		$attending = !($a === '0' or $a === 0 or $a === false
			or $a === 'false' or $a === '');
	}

	// throws Users_Exception_NotAuthorized unless they run this event
	$stream = Calendars_Attendance::requestedStream($currentUser->id);

	$participant = Calendars_Attendance::setAttending(
		$stream, $userId, $attending, $currentUser->id,
		Calendars_Attendance::isAdmin($stream)
	);

	Q_Response::setSlot('participant', $participant->exportArray());
	Q_Response::setSlot('attending', $attending);
}
