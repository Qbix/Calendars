<?php

/**
 * @module Calendars
 */

/**
 * This tool renders a preview of an event, or a composer if streamName option is empty
 * @class Calendars event preview
 * @constructor
 */
function Calendars_event_preview_tool($options)
{
	Q_Response::setToolOptions($options);
}