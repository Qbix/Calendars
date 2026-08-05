<?php
	
function Calendars_0_5_5_Streams()
{
	$communityId = Users::communityId();
	echo "Adding Calendars/organizers roles";
	Users_Label::addLabel("Calendars/organizers", $communityId, "Organizers", "{{Calendars}}/img/icons/labels/Calendars/organizers", false);
	echo "\n";
}
Calendars_0_5_5_Streams();