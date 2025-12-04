<?php

function Calendars_after_Assets_credits_spend($params)
{
    $fromUserId = Q::ifset($params, 'options', 'fromUserId', null);
    $toPublisherId = Q::ifset($params, 'options', 'toPublisherId', null);
    $toStreamName = Q::ifset($params, 'options', 'toStreamName, null');
    if ($toPublisherId and $toStreamName) {
        $stream = Streams_Stream::fetch($toPublisherId, $toPublisherId, $toStreamName);
        if ($stream) {
            // TODO: check amounts, but for now assume
            // user was paying to be going to the event.
            // TODO: check whether event requires approval,
            // and whether the user has been approved.
            // For now, just let them attend the event and see its location.
            Calendars_Event::going($stream, $fromUserId, 'yes');
        }
    }
}