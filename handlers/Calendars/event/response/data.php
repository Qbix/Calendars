<?php

/**
 * @module Calendars
 */

/**
 * This handler read and return some additional data related to event
 * @class Calendars event data
 * @param {array} $options
 * @param {string} $publisherId
 * @param {string} $streamName
 * @constructor
 * @return array
 */
function Calendars_event_response_data ($options) {
	$request = array_merge($_REQUEST, $options);
	$required = array("publisherId", "streamName");
	Q_Valid::requireFields($required, $request, true);
	$request = Q::take($request, $required);
	$data = array();

	$stream = Streams::fetchOne(null, $request["publisherId"], $request["streamName"], true);

	// get live webrtc
	$relatedWebrtc = Streams_Stream::select('ss.*', 'ss')
		->join(Streams_relatedTo::table(true, 'srt'), array(
			'srt.fromStreamName' => 'ss.name',
			'srt.fromPublisherId' => 'ss.publisherId',
			'srt.type' => '"Media/webrtc"'
		))->where(array(
			'srt.toPublisherId' => $stream->publisherId,
			'srt.toStreamName' => $stream->name,
			'ss.type' => 'Media/webrtc'
		))->fetchDbRows();
	foreach ($relatedWebrtc as $webrtc) {
		$webrtc = Streams::fetchOne(null, $webrtc->publisherId, $webrtc->name, true);
		if (!$webrtc->getAttribute("endTime")) {
			$data["liveWebrtc"] = array(
				"publisherId" => $webrtc->publisherId,
				"streamName" => $webrtc->name
			);
			break;
		}
	}

	return $data;
}