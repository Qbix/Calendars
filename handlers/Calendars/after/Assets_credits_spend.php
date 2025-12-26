<?php

function Calendars_after_Assets_credits_spend($params)
{
    $amountCredits = Q::ifset($params, 'amountCredits', 0);
    $fromUserId = Q::ifset($params, 'fromUserId', null);
    $toPublisherId = Q::ifset($params, 'options', 'toPublisherId', null);
    $toStreamName = Q::ifset($params, 'options', 'toStreamName', null);

    if (!Q::startsWith($toStreamName, 'Calendars/event/') || $amountCredits <= 0) {
        return;
    }

    $stream = Streams_Stream::fetch($toPublisherId, $toPublisherId, $toStreamName);
    if (Assets_Credits::getPaymentsInfo($fromUserId, array(
        'publisherId' => $toPublisherId,
        'streamName'  => $toStreamName
    ))["conclusion"]["fullyPaid"]) {
        // TODO: check whether event requires approval,
        // and whether the user has been approved.
        // For now, just let them attend the event and see its location.
        Calendars_Event::going($stream, $fromUserId, 'yes', array(
            'skipPayment' => true // avoid infinite
        ));
    }
}