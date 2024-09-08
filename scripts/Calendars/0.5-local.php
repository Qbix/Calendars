<?php

function Calendars_0_5_local()
{	
	// symlink the icons folder
	Q_Utils::symlink(
		CALENDARS_PLUGIN_FILES_DIR.DS.'Calendars'.DS.'icons',
		CALENDARS_PLUGIN_WEB_DIR.DS.'img'.DS.'icons',
		true
	);
}

Calendars_0_5_local();
