<?php
function Calendars_before_Q_sessionExtras () {
	Q_Response::setScriptData('Q.plugins.Calendars.event.templateStyle', Q_Config::get('Calendars', 'event', 'templateStyle', null));
}
