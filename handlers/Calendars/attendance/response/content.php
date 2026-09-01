<?php

/**
 * Renders the attendance page for an event.
 * Route: Calendars/attendance/:publisherId/:eventId
 * Throws Users_Exception_NotAuthorized unless the viewer administers the event.
 *
 * @return {string}
 */
function Calendars_attendance_response_content()
{
	$user = Users::loggedInUser(true);
	$stream = Calendars_Attendance::requestedStream($user->id);
	$stream->addPreloaded($user->id);
	return Q::view('Calendars/content/attendance.php', compact('stream'));
}
