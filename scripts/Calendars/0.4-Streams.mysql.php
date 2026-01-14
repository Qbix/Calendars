<?php
	
function Calendars_0_4_Streams()
{
	// first community
	$communities = array(Users::communityId() => Users::communityName());
	// other communities
	$communities = array_merge($communities, Q_Config::get('Communities', 'communities', array()));

	foreach ($communities as $communityId => $communityName) {
		$streamName = 'Calendars/calendar/main';

		// get or create stream
		$stream = Streams_Stream::fetch($communityId, $communityId, $streamName);
		if (!($stream instanceof Streams_Stream)) {
			$stream = Streams::create($communityId, $communityId, 'Calendars/calendar', array(
				'name' => $streamName
			));
		}

		if (!($stream instanceof Streams_Stream)) {
			die("[ERROR]: wrong events main category for $communityId".PHP_EOL);
		}

		echo "Joining registered users to $stream->publisherId-$stream->name".PHP_EOL;
		$offset = 0;
		$i = 0;
		while (1) {
			$users = Users_User::select('u.*', 'u')
				->join(
					'streams_participant sp',
					array(
						'sp.userId' => new Db_Expression('u.id'),
						'sp.publisherId' => $stream->publisherId,
						'sp.streamName' => $stream->name
					),
					'LEFT'
				)
				->where(array(
					'u.signedUpWith !=' => 'none',
					'sp.userId' => null // NOT participating
				))
				->limit(100, $offset)
				->fetchDbRows();
			if (!$users) {
				break;
			}
			foreach ($users as $user) {

				$stream->join(array('userId' => $user->id));

				++$i;
				echo "\033[100D";
				echo "Joined $i users";
			}
			$offset += 100;
		}
		echo PHP_EOL;
	}
}
Calendars_0_4_Streams();