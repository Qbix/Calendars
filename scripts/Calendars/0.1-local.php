<?php
	
function Calendars_0_1_local()
{
	$from = CALENDARS_PLUGIN_VIEWS_DIR.DS.'Calendars'.DS.'templates';
	$dir = APP_WEB_DIR.DS.'Q'.DS.'views'.DS.'Calendars';
	$to = $dir.DS.'templates';
	if (!file_exists($to)) {
		if (!file_exists($dir)) {
			mkdir($dir, 0777, true);
		}
		Q_Utils::symlink($from, $to);
	}
	
	// symlink the icons folder
	/*Q_Utils::symlink(
		CALENDARS_PLUGIN_FILES_DIR.DS.'Calendars'.DS.'icons',
		CALENDARS_PLUGIN_WEB_DIR.DS.'img'.DS.'icons',
		true
	);*/
}

Calendars_0_1_local();