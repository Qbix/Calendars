<?php
/**
 * Hook to return credits to participants
 * @event Streams/close/Calendars_event {before}
 * @param {array} $params
 */
function Calendars_before_Streams_close_Calendars_event($params) {
	$stream = $params['stream'];

	// if event already started, don't return credits
	if ((int)$stream->getAttribute("startTime") < time()) {
		return;
	}

	// leave all participants from event to return credits if event paid
	$participants = Streams_Participant::select()->where(array(
		"publisherId" => $stream->publisherId,
		"streamName" => $stream->name,
		"state" => "participating"
	))->fetchDbRows();
	foreach ($participants as $participant) {
		Calendars_Event::rsvp($stream, $participant->userId, "no", array("skipAccess" => true));
	}
}