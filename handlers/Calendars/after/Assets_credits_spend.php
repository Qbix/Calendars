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

    $stream = Streams_Stream::fetch($toPublisherId, $toPublisherId, $toStreamName, true);
    if (Assets_Credits::getPaymentsInfo($fromUserId, array(
        'publisherId' => $toPublisherId,
        'streamName'  => $toStreamName
    ))["conclusion"]["fullyPaid"]) {
        // TODO: check whether event requires approval,
        // and whether the user has been approved.
        // For now, just let them attend the event and see its location.
        $going = 'yes';
        $paid = 'fully';
    } else {
        $going = 'maybe';
        $paid = 'reserved';
    }
    $participant = new Streams_Participant();
    $participant->publisherId = $stream->publisherId;
    $participant->streamName = $stream->name;
    $participant->userId = $fromUserId;
    if ($participant->retrieve(null, false, array("ignoreCache" => true))) {
        $participant->setExtra('paid', $paid);
        $participant->save();
    }

    // check if Calendars_Event::going processing currently. So it means we get here from Calendars_Event::going
    // if yes, do nothing, because Calendars_Event::going take care about all
    if (Q::ifset(Calendars_Event::$callScope, "going", Calendars_Event::callScopeKey($toPublisherId, $toStreamName, $fromUserId), null)) {
        return;
    }

    Calendars_Event::going($stream, $fromUserId, $going, array(
        'skipPayment' => true // avoid infinite
    ));
}