<?php
function Calendars_after_Users_Label_can ($params, &$result) {
	$labelsCanManageEvents = Q_Config::get("Calendars", "events", "admins", array());

	$result['manageEvents'] = false;
	foreach ($params["userCommunityRoles"] as $label => $role) {
		if (in_array($label, $labelsCanManageEvents)) {
			$result['manageEvents'] = true;
		}
	}
}