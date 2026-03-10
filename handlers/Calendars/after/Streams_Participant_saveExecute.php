<?php
function Calendars_after_Streams_Participant_saveExecute($params)
{
	$row = $params['row'];
	if (strpos($row->streamName, 'Calendars/') === 0 && Q::ifset($params, 'modifiedFields', 'extra', null)) {
        $extra = Q::json_decode($params['modifiedFields']['extra'], true);
        $extraOriginal = Q::json_decode($params['fieldsOriginal']['extra'], true);
        $stream = Streams_Stream::select()->where(array(
            'publisherId' => $row->publisherId,
            'name' => $row->streamName
        ))->fetchDbRow();

        if (Q::ifset($extra, 'going', null) !== Q::ifset($extraOriginal, 'going', null)) {
            Streams_Message::post($row->userId, $row->publisherId, $row->streamName, array(
                'type' => 'Calendars/going/'.$extra['going'],
                'instructions' => array(
                    'participant' => $row->toArray()
                )
            ), true);
        }

        if (Q::ifset($stream->getAttribute("payment"), "type", null) == "required") {
            if ($extra['paid'] == 'fully' && $row->testRoles("arrived")) {
                Calendars_Event::grantRoles($row, ["attendee", "registered"], true);
                return;
            } elseif ($extra['paid'] != 'fully' && $row->testRoles("attendee")) {
                Calendars_Event::grantRoles($row, "arrived", true);
                return;
            }
        }

        Streams_Message::post($row->publisherId, $row->publisherId, $row->streamName, array(
            'type' => 'Streams/participant/extraUpdated',
            'instructions' => array(
                'participant' => $row->toArray()
            )
        ), true);
	}
}