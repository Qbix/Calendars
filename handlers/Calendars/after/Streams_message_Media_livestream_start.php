<?php
function Calendars_after_Streams_message_Media_livestream_start($params) {
	//if livestream was started in teleconference that is a part of online event, we should post Calendars/event/livestream/started message to the event stream
	$stream = $params['stream'];

	$instruction = json_decode($params['message']->fields['instructions'], true);
	if ($stream->type == "Media/webrtc") {
		Calendars_Event::postMessage($stream, 'livestreamStart', [
			'publisherId' => $instruction['livestreamPublisherId'],
			'streamName' => $instruction['livestreamStreamName']
		]);
	}
}