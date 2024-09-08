<?php
function Calendars_after_Streams_message_Streams_join($params) {
	$message = $params['message'];
	$stream = $params['stream'];

	if ($stream->type == "Media/webrtc") {
		Calendars_Event::postMessage($stream, 'join');
	}
}