<?php

function Calendars_after_Assets_credits_spend($params)
{
    $amountCredits = Q::ifset($params, 'amountCredits', 0);
    $fromUserId = Q::ifset($params, 'fromUserId', null);
    $toPublisherId = Q::ifset($params, 'options', 'toPublisherId', null);
    $toStreamName = Q::ifset($params, 'options', 'toStreamName', null);
    if (!Q::startsWith($toStreamName, 'Calendars/event/')) {
        return;
    }
    if ($toPublisherId and $toStreamName and $amountCredits > 0) {
        if ($stream = Streams_Stream::fetch($toPublisherId, $toPublisherId, $toStreamName)) {
            // TODO: check amounts, but for now assume
            // user was paying to be going to the event.
            // TODO: check whether event requires approval,
            // and whether the user has been approved.
            // For now, just let them attend the event and see its location.
            Calendars_Event::going($stream, $fromUserId, 'yes', array(
                'skipPayment' => true // avoid infinite
            ));
        }
    }
}