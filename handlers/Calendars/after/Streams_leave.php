<?php

function Calendars_after_Streams_leave($params)
{
	$asUserId    = $params['asUserId'];     // user leaving
	$publisherId = $params['publisherId'];  // event publisher
	$streams     = $params['streams'];      // array of Streams_Stream objects
	$participants = $params['participants'];

	if (!class_exists('Assets_Credits')) {
		return true;
	}

	foreach ($streams as $stream) {

		// Only refund for Calendars/event streams
		if ($stream->type !== 'Calendars/event') {
			continue;
		}

		$eventPublisherId = $stream->publisherId;
		$eventStreamName  = $stream->name;

		// Fetch event in proper viewer context
		$event = Streams_Stream::fetch(
			$asUserId,
			$eventPublisherId,
			$eventStreamName
		);

		// No refunds after event start
		$start = (int) $event->getAttribute('startTime');
		if ($start && $start <= time()) {
			continue;
		}

		// Look up historical payment that has not been refunded yet
		$joinRow = Assets_Credits::checkJoinPaid(
			$asUserId,
			array(
				'publisherId' => $eventPublisherId,
				'streamName'  => $eventStreamName
			),
			null,
			array(
				'reasons' => array(Assets::JOINED_PAID_STREAM, 'EventParticipation')
			)
		);

		if (!$joinRow) {
			continue; // no payment OR already refunded
		}

		// Refund FROM event host → TO the attendee
		Assets_Credits::refund(
			null,                      // community
			$joinRow->amount,          // exact amount paid
			Assets::LEFT_PAID_STREAM,  // refund reason
			$joinRow->toUserId,        // event publisher (receiver of original payment)
			$joinRow->fromUserId,      // attendee
			array(
				'toPublisherId' => $eventPublisherId,
				'toStreamName'  => $eventStreamName
			)
		);
	}

	return true;
}
