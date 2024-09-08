<?php
	
function Calendars_0_4_1_Streams()
{
	// labels have permissions to create events on behalf of communities
	$labels = Q_Config::expect("Calendars", "events", "admins");

	// add template and access for each label in the main community
	Streams::saveTemplate('Calendars/event', '', array(), $labels);
}
Calendars_0_4_1_Streams();