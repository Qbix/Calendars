<?php

function Calendars_after_Assets_credits_refund($params)
{
    $amountCredits = Q::ifset($params, 'amountCredits', 0);
    $toUserId = Q::ifset($params, 'toUserId', null);
    $fromUserId = Q::ifset($params, 'fromUserId', null);
    $fromPublisherId = Q::ifset($params, 'attributes', 'fromPublisherId', null);
    $fromStreamName = Q::ifset($params, 'attributes', 'fromStreamName', null);
    $fromStreamTitle = Q::ifset($params, 'attributes', 'fromStreamTitle', null);

    if (!Q::startsWith($fromStreamName, 'Calendars/event/')) {
        return;
    }

    $stream = Streams_Stream::fetch($fromPublisherId, $fromPublisherId, $fromStreamName);
    $participant = new Streams_Participant();
    $participant->publisherId = $stream->publisherId;
    $participant->streamName = $stream->name;
    $participant->userId = $toUserId;
    if ($participant->retrieve(null, false, array("ignoreCache" => true))) {
        $participant->setExtra('paid', 'refunded');
        $participant->save();
    }

    // check if Calendars_Event::going processing currently. So it means we get here from Calendars_Event::going
    // if yes, do nothing, because Calendars_Event::going take care about all
    if (Q::ifset(Calendars_Event::$callScope, "going", Calendars_Event::callScopeKey($fromPublisherId, $fromStreamName, $toUserId), null)) {
        return;
    }

    if ($stream) {
        Calendars_Event::going($stream, $toUserId, 'no');
    }
}