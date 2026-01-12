<?php

function Calendars_livestreamSubscription_response_subscription($params)
{
    $params = array_merge($_REQUEST, $params);
    $streamName = Q::ifset($params, 'streamName', null);
    $publisherId = Q::ifset($params, 'publisherId', null);

    $response = [];
    $subscription = Streams_Subscription::select('*', 'a')
        ->where(array(
            'a.publisherId' => $publisherId,
            'a.streamName' => $streamName,
            'a.ofUserId' => Users::loggedInUser(true)->id
        ))->limit(1)->fetchDbRow();

    if (!is_null($response)) {
        $response['subscription'] = $subscription;
    }

    Q_Response::setSlot("subscription", $response);
}
