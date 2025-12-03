<?php
function Calendars_after_Streams_Participant_saveExecute($params)
{
	$row = $params['row'];
	if (strpos($row->streamName, 'Calendars/') === 0 && Q::ifset($params, 'modifiedFields', 'extra', null)) {
        Streams_Message::post($row->publisherId, $row->publisherId, $row->streamName, array(
            'type' => 'Streams/participant/save',
            'instructions' => array(
                'userId' => $row->userId
            )
        ), true);
	}
}