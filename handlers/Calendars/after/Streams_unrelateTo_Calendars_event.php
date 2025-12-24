<?php

function Calendars_after_Streams_unrelateTo_Calendars_event($params)
{
	$rel = $params['relatedTo'];

	if (is_array($rel)) {
		foreach ($rel as $item) {
			Calendars_after_Streams_unrelateTo_Calendars_event(array('relatedTo' => $item));
		}
		return true;
	}

	// Fetch event
	$event = Streams_Stream::fetch(
		$rel->toPublisherId,
		$rel->fromPublisherId,
		$rel->toStreamName
	);

	// No refund after event start
	// TODO: later make the formula depend on seconds before or after start of event
	if ((int)$event->getAttribute('startTime') <= time()) {
		return true;
	}

	// Lookup the payment previously made
	$paid = Assets_Credits::checkJoinPaid(
		$rel->fromPublisherId,
		array('publisherId' => $rel->toPublisherId,   'streamName' => $rel->toStreamName),
		array('publisherId' => $rel->fromPublisherId, 'streamName' => $rel->fromStreamName),
		array('reasons'     => array(Assets::JOINED_PAID_STREAM))
	);

	if (!$paid) {
		return true;
	}

	// Refund FROM event publisher TO the user
	Assets_Credits::refund(
		null,                      // community
		$paid->amount,             // amount
		Assets::LEFT_PAID_STREAM,  // reason
		$paid->toUserId,           // fromUserId (publisher or host)
		$paid->fromUserId,         // toUserId (registered)
		array(
			'toPublisherId'   => $rel->toPublisherId,
			'toStreamName'    => $rel->toStreamName,
			'fromPublisherId' => $rel->fromPublisherId,
			'fromStreamName'  => $rel->fromStreamName
		)
	);

	return true;
}
