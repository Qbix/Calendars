<?php
/**
 * Used to get payment info for event
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The id of the event's publisher
 * @param {string} [$params.eventId] Required. The id of the event.
 */
function Calendars_payment_response_info($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);

    $stream = Streams_Stream::fetch($r['publisherId'], $r['publisherId'], 'Calendars/event/'.$r['eventId'], true);
    $payment = $stream->getAttribute("payment");

    $isAssetsCustomer = null;
    $user = Users::loggedInUser();
    if ($user) { // check if user assets customer
        $assetsCharge = new Assets_Charge();
        $assetsCharge->userId = $user->id;
        if ($assetsCharge->retrieve()) {
            $isAssetsCustomer = true;
        }
    }

	return compact("payment", "isAssetsCustomer");
}