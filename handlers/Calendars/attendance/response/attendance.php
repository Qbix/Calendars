<?php

/**
 * Returns everyone participating in an event, grouped by "going"
 * and sorted alphabetically by first name, then last name.
 * Only event admins (and screeners) may call this.
 *
 * @param {string} $_REQUEST.publisherId
 * @param {string} $_REQUEST.eventId
 * @return {array}
 */
function Calendars_attendance_response_attendance()
{
	$user = Users::loggedInUser(true);
	$stream = Calendars_Attendance::requestedStream($user->id);
	$groups = Calendars_Attendance::people($stream, $user->id);

	$counts = array();
	$total = 0;
	foreach ($groups as $going => $people) {
		$counts[$going] = count($people);
		$total += count($people);
	}

	$payment = $stream->getAttribute('payment');

	return array(
		'publisherId' => $stream->publisherId,
		'streamName' => $stream->name,
		'title' => $stream->title,
		'paymentRequired' => (Q::ifset($payment, 'type', null) === 'required'),
		// whether this viewer can tap someone to check them in
		'canCheckIn' => true,
		'groups' => $groups,
		'counts' => $counts,
		'total' => $total
	);
}
