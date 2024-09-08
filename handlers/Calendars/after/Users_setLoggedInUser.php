<?php
	
function Calendars_after_Users_setLoggedInUser($params)
{
	$user = $params['user'];
	if (Users::isCommunityId($user->id)) {
		return;
	}

	// join user to category Calendars/calendar/main of main community
	$communityId = Users::communityId();
	$stream = Calendars::eventsCalendar($communityId, Users::communityName() . ' Events');
	$stream->join();
}