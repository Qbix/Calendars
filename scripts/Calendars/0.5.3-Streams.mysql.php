<?php
function Calendars_0_5_3_mysql () {
	$link = STREAMS_PLUGIN_FILES_DIR.DS.'Streams'.DS.'icons'.DS.'Calendars';
	if (!file_exists($link)) {
		Q_Utils::symlink(
			CALENDARS_PLUGIN_FILES_DIR.DS.'Calendars'.DS.'icons'.DS.'Calendars',
			$link
		);
	}
}
Calendars_0_5_3_mysql();