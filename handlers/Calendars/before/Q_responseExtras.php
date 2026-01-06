<?php

function Calendars_before_Q_responseExtras()
{
	Q_Response::addScript('{{Calendars}}/js/Calendars.js', "Calendars");
	Q_Response::addStylesheet("{{Calendars}}/css/Calendars.css", "Calendars");
	$defaults = Q_Config::expect('Calendars', 'events', 'defaults');
	Q_Response::setScriptData('Q.plugins.Calendars.Event.defaults', $defaults);

	// set events types array to client
	$eventType = Q_Config::get('Calendars', 'events', 'types', null);
	Q_Response::setScriptData('Q.plugins.Calendars.events.types', $eventType);

	// image sizes
	Q_Response::setImageSizes('Calendars/event');

	// set some configs
	Q_Response::setScriptData('Q.plugins.Calendars.Event.unpaid.hide', Q_Config::get('Calendars', 'event', 'unpaid', 'hide', null));
    Q_Response::setScriptData('Q.plugins.Calendars.Event.mode', Q_Config::get('Calendars', 'event', 'mode', null));
	Q_Response::setScriptData('Q.plugins.Calendars.Event.isAdmin', Calendars_Event::isAdmin());
	Q_Response::setScriptData('Q.plugins.Calendars.Event.reminders', Q_Config::get('Calendars', 'event', 'reminders', null));
}
