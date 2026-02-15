<?php
date_default_timezone_set('UTC');
ini_set('max_execution_time', 0);

$FROM_APP = defined('RUNNING_FROM_APP'); //Are we running from app or framework?

if(!$FROM_APP) {
	die(PHP_EOL.PHP_EOL.'this script should be called from application');
}

$remindersConfig = Q_Config::get('Calendars', 'event', 'reminders', null);
if (empty($remindersConfig)) {
	die("Reminders config empty"."\n");
}
$remindersDefault = array();
foreach ($remindersConfig as $key => $val) {
	if (Q::ifset($val, "selected", false)) {
		$remindersDefault[] = $key;
	}
}


$reminders = Q_Config::get("Calendars", "event", "reminders", array());
$max = 0;
foreach ($reminders as $key => $v) {
	$key = (int)$key;
	if ($key > $max) {
		$max = $key;
	}
}
// get events
$eventsRelations = Streams_RelatedTo::select()->where(array(
	"toStreamName" => "Calendars/calendar/main",
	"type" => "Calendars/events",
	"weight > " => new Db_Range(time(), true, false, time() + $max + 3600)
))->fetchDbRows();

$messageType = "Calendars/reminder";
$timeDiff = 300; // 5 minutes

foreach ($eventsRelations as $eventsRelation) {
    $event = Streams_Stream::fetch($eventsRelation->fromPublisherId, $eventsRelation->fromPublisherId, $eventsRelation->fromStreamName);

	echo "Processing event: ".$event->name."\n";

	// check recurring start time
	$startTime = (int)$event->getAttribute("startTime");
	if ($startTime < time()) {
		continue;
	}

	// get perticipants
	$participants = Streams_Participant::select()->where(array(
		"publisherId" => $event->publisherId,
		"streamName" => $event->name,
		"state" => "participating",
		"subscribed" => "yes"
	))->fetchDbRows();

	foreach ($participants as $participant) {
		if ($participant->getExtra("going") != "yes") {
			continue;
		}

		$reminders = $participant->getExtra("reminders");
		if (!is_array($reminders)) {
			$reminders = $remindersDefault;
		}
		if (!is_array($reminders) || empty($reminders)) {
			continue;
		}

		$stream = Streams_Stream::fetch($participant->userId, $participant->userId, "Calendars/user/reminders");
		if (!$stream) {
			echo "Streams Calendars/user/reminders not found for user ".$participant->userId;
			continue;
		}

		foreach ($reminders as $reminder) {
			$reminder = (int)$reminder;
			$timeToRemind = $startTime - time() - $reminder;
			if (abs($timeToRemind) > $timeDiff) {
				continue;
			}

			$stream->post(Users::communityId(), array(
				'type' => $messageType,
				'instructions' => array(
					"name" => $event->title,
					"time" => secondsToTime($reminder),
					"link" => $event->url(),
					"url" => $event->url()
				)
			), true);
		}
	}
}

function secondsToTime($seconds) {
	$dtF = new DateTime("@0");
	$dtT = new DateTime("@$seconds");
	$a=$dtF->diff($dtT)->format('%a');
	$h=$dtF->diff($dtT)->format('%h');
	$i=$dtF->diff($dtT)->format('%i');
	$s=$dtF->diff($dtT)->format('%s');
	$res = "";
	if ($a>0) {
		if ($dtF->diff($dtT)->format('%a') == 1) {
			$days = "day";
		} else {
			$days = "days";
		}
		$res .= $dtF->diff($dtT)->format('%a '.$days.' ');
	}
	if($h>0) {
		if ($dtF->diff($dtT)->format('%h') == 1) {
			$hours = "hour";
		} else {
			$hours = "hours";
		}
		$res .= $dtF->diff($dtT)->format('%h '.$hours.' ');
	}
	if($i>0) {
		if ($dtF->diff($dtT)->format('%i') == 1) {
			$minutes = "minute";
		} else {
			$minutes = "minutes";
		}
		$res .= $dtF->diff($dtT)->format(' %i '.$minutes.' ');
	}

	return $res;
}