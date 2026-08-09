<?php

/**
 * Title for the attendance page.
 * @return {string}
 */
function Calendars_attendance_response_title()
{
	$user = Users::loggedInUser(true);
	$stream = Calendars_Attendance::requestedStream($user->id);
	$text = Q_Text::get('Calendars/content');
	$label = Q::ifset($text, 'attendance', 'Title', 'Attendance');
	return $stream->title
		? "$label: " . $stream->title
		: $label;
}
