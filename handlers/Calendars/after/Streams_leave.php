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


		// Fetch event in proper viewer context
		$event = Streams_Stream::fetch(
			$asUserId,
			$stream->publisherId,
			$stream->name
		);

		// No refunds after event start
		$start = (int) $event->getAttribute('startTime');
		if ($start && $start <= time()) {
			continue;
		}

		// Look up historical payment that has not been refunded yet
		$payments = Assets_Credits::getPaymentsInfo(
			$asUserId,
			array(
				'publisherId' => $stream->publisherId,
				'streamName'  => $stream->name
			)
		);

		if (!$payments['conclusion']['amount']) {
			continue; // no payment OR already refunded
		}

		// Refund FROM event host to TO the registered
		Assets_Credits::refund(
			null,                      // community
			$payments['conclusion']['amount'],          // exact amount paid
			Assets::LEFT_PAID_STREAM,  // refund reason
            $payments['conclusion']['toUserId'],        // event publisher (receiver of original payment)
            $payments['conclusion']['fromUserId'],      // registered
			array(
				'toPublisherId' => $event->publisherId,
				'toStreamName'  => $event->name,
				'toStreamTitle' => $event->title
			)
		);
	}

	return true;
}
