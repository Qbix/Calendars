<?php
/**
 * Hook to check if user participated to event before join teleconference
 * @event Db/Row/Streams_Participant/save {before}
 * @param {array} $params
 */
function Calendars_before_Streams_Participant($params)
{
	$row = $params['row'];
	if ($row->streamType != "Media/webrtc" || $row->state != "participating") {
		return;
	}

	$streams = Streams::related(null, $row->publisherId, $row->streamName, false, array(
		'type' => 'Media/webrtc',
		'where' => array(
			'toStreamName' => new Db_Range('Calendars/event/', false, false, true)
		),
		'streamsOnly' => true,
		'skipAccess' => true
	));
	$streamEvent = reset($streams);
	if (empty($streamEvent)) {
		return;
	}

	$streamEvent = Streams::fetchOne(null, $streamEvent->publisherId, $streamEvent->name);
	if (Calendars_Event::getRsvp($streamEvent, $row->userId) != "yes") {
		throw new Exception(Q_Text::get("Calendars/content")["event"]["tool"]["YouAreNotParticipated"]);
	}
}