<?php
	
function Calendars_0_5_4_Streams()
{
	$communityId = Users::communityId();
	echo "Adding Calendars/matchmakers and Calendars/promoters roles";
	Users_Label::addLabel("Calendars/matchmakers", $communityId, "Matchmakers", "{{Calendars}}/img/icons/labels/Calendars/matchmakers", false);
	Users_Label::addLabel("Calendars/promoters", $communityId, "Event Promoters", "{{Calendars}}/img/icons/labels/Calendars/promoters", false);
	echo "\n";
}
Calendars_0_5_4_Streams();