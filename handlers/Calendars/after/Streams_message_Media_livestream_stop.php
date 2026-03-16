<?php
function Calendars_after_Streams_message_Media_livestream_stop($params) {
		//if livestream was started in teleconference that is a part of online event, we should post Calendars/event/livestream/stopped message to the event stream
	$stream = $params['stream'];

	if ($stream->type == "Media/webrtc") {
		Calendars_Event::postMessage($stream, 'livestreamStop');
	}
}