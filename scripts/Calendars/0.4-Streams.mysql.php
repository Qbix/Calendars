<?php

function Calendars_0_4_Streams()
{
	// first community
	$communities = array(
		Users::communityId() => Users::communityName()
	);
	// other communities
	$communities = array_merge(
		$communities,
		Q_Config::get('Communities', 'communities', array())
	);

	foreach ($communities as $communityId => $communityName) {

		$streamName = 'Calendars/calendar/main';

		// get or create stream
		$stream = Streams_Stream::fetch($communityId, $communityId, $streamName);
		if (!($stream instanceof Streams_Stream)) {
			$stream = Streams::create(
				$communityId,
				$communityId,
				'Calendars/calendar',
				array('name' => $streamName)
			);
		}

		if (!($stream instanceof Streams_Stream)) {
			die("[ERROR]: wrong events main category for $communityId" . PHP_EOL);
		}

		echo "Joining registered users to {$stream->publisherId} {$stream->name}" . PHP_EOL;

		$i = 0;

		$q = Users_User::select('u.*', 'u')
			->join(
				'streams_participant sp',
				array(
					'sp.userId' => 'u.id',
					'sp.publisherId' => '?',
					'sp.streamName' => '?'
				),
				'LEFT'
			)
			->where(array(
				'u.signedUpWith !=' => 'none',
				'sp.userId' => null // NOT participating
			))
			->orderBy('u.id', true)
			->bind(array(
				$stream->publisherId,
				$stream->name
			))
			->nextChunk(array(
				'chunkSize' => 100,
				'index' => 'u.id'
			));

		$users = $q->fetchDbRows(null, 'u_', 'id');

		while ($users) {

			foreach ($users as $userId => $user) {

				$stream->join(array(
					'userId' => $user->id
				));

				++$i;
				echo "\033[100D";
				echo "Joined $i users";
			}

			// advance cursor (keys are ids)
			end($users);
			$q->lastChunkValue = key($users);

			$q->nextChunk();
			$users = $q->fetchDbRows(null, 'u_', 'id');
		}

		echo PHP_EOL;
	}
}

Calendars_0_4_Streams();