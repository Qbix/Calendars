<?php
	
function Streams_0_4_5_2_Calendars()
{
	$offset = 0;
	$i = 0;
	echo "Creating Calendars/user/reminders streams".PHP_EOL;
	while (1) {
		$users = Users_User::select()
			->limit(100, $offset)
			->fetchDbRows();
		if (!$users) {
			break;
		}
		foreach ($users as $user) {
			if (Users::isCommunityId($user->id)) {
				continue;
			}

			$stream = Streams_Stream::fetch($user->id, $user->id, "Calendars/user/reminders");
			if ($stream) {
				continue;
			}
			Streams::create($user->id, $user->id, "Calendars/reminders", array(
				'name' => "Calendars/user/reminders"
			), array(
				'skipAccess' => true
			))->subscribe(array('userId' => $user->id));
			++$i;
			echo "\033[100D";
			echo "Created $i streams";
		}
		$offset += 100;
	};
	echo PHP_EOL;
}
Streams_0_4_5_2_Calendars();