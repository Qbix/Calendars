<?php
function Calendars_icons_response_content ($params)
{
	Q_Response::addStylesheet("{{Calendars}}/css/icons.css");
	Q_Response::addScript("{{Calendars}}/js/pages/icons.js");

	return Q::view('Calendars/content/icons.php');
}