<?php

function Calendars_calendarIcs_response ()
{
    $publisherId = Q_Dispatcher::uri()->publisherId;
    $userId = Q_Dispatcher::uri()->userId;
    $communityName = Users::communityName();
    $communityId = Users::communityId();
    $alertTime = Q_Config::get('Calendars', 'user', 'calendars', 'alerts', 'minutes', 5);
    $timezoneName = Q::ifset($_REQUEST, 'timezoneName', 'UTC');

    $user = Users::fetch($userId, true);
    $liu = Users::loggedInUser();
    if (!$liu or $liu->id !== $user->id) {
        $authorized = false;
        if (!empty($_REQUEST['token'])) {
            $token = $_REQUEST['token'];
            $capability = Calendars::capability($userId);
            if ($token === $capability->signature()) {
                $authorized = true;
            }
        }
        if (!$authorized) {
            throw new Users_Exception_NotAuthorized();
        }
    }

    $fromTime = time(); // select all past events
    $participating = array();
    if (class_exists('Calendars')) {
        $participating = Calendars::participating($user->id, $fromTime, null, 'yes', array(
            'streamsOnly' => true
        ));
    } else {
        throw new Q_Exception(
            "Calendar plugin not found"
        );
    }

    $getConditionValue = function($x) {
        // default time for compare is updatedTime
        $cond = strtotime($x->fields['updatedTime']);

        // for events use startTime time to compare
        if ($x->fields["type"] == "Calendars/event") {
            $cond = (int)$x->getAttribute("startTime");
        }

        // for trips use arrive time to compare
        if ($x->type == "Travel/trip") {
            if ($x->getAttribute("type") == "Travel/to") {
                $timeToCompare = "endTime";
                $cond = (int)$x->getAttribute($timeToCompare) - 1;
            } else {
                $timeToCompare = "startTime";
                $cond = (int)$x->getAttribute($timeToCompare) + 1;
            }
        }

        return $cond;
    };

    // sort trip and event streams in ascending order
    usort($participating, function ($a, $b) use($getConditionValue)	{
        $a2 = $getConditionValue($a);
        $b2 = $getConditionValue($b);
        return ($a2 < $b2) ? -1 : ($a2 > $b2 ? 1 : 0);
    });

    function splitString($string) {
        $totallength = mb_strlen($string, '8bit');
        $iterationsNum = ceil($totallength / 75);
        $resultArr = [];
        $startCut = 0;
        for($i = 1; $i <= $iterationsNum; $i++){
            $resultArr[] = mb_strcut($string, $startCut, 75);
            $startCut = $startCut+75;
        }
        return $resultArr;
    }

    $ics = "BEGIN:VCALENDAR\n";
    $ics .= "VERSION:2.0\n";
    $ics .= "PRODID:-//$communityName//Personal Calendar//EN\n";
    $ics .= "CALSCALE:GREGORIAN\n";
    $ics .= "METHOD:PUBLISH\n";

    foreach ($participating as $k => $v) {
        $info = Calendars_Event::info($v, $timezoneName);
        $dtstart = gmdate('Ymd\THis\Z', $v->getAttribute('startTime'));
        $dtend = gmdate('Ymd\THis\Z', $v->getAttribute('endTime'));
        $dtstamp = gmdate('Ymd\THis\Z', strtotime($v->fields['insertedTime']));
        $streamName = $v->fields['name'];
        $eventId = str_replace('Calendars/event/', '', $streamName);
        $uid = $v->fields['publisherId'] . "-" . $eventId . "@" . $_SERVER['SERVER_NAME'];
        $description = preg_replace("/\n/m", "\\n", implode('\n', splitString($v->fields['content'])));
        $lastModified = $v->fields['insertedTime'];
        $lastModifiedTzFormat = gmdate('Ymd\THis\Z', strtotime($lastModified));
        $summary = preg_replace("/\n/m", "\\n", implode('\n', splitString($v->fields['title'])));
        $address = preg_replace("/\n/m", "\\n", implode('\n', splitString($info['address'])));
        $eventUrl = Q_Uri::interpolateUrl("{{baseUrl}}/event/" . $v->fields['publisherId'] . "/" . $eventId);
        $recurringInfoStreams = $v->related(null, false, array('streamsOnly' => true, 'where' => ['type' => 'Calendars/recurring']));

        $messages = $v->getMessages(['type' => 'Streams/changed']);
        $sequence = count($messages);

        $ics .= "BEGIN:VEVENT\n";
        $ics .= "DTSTART:$dtstart\n";
        $ics .= "DTEND:$dtend\n";
        if(count($recurringInfoStreams) > 0) {
            $recurringInfoStream = array_values($recurringInfoStreams)[0];
            $rrule = Calendars_event::recurrenceRule($recurringInfoStream->publisherId, $recurringInfoStream->name, $user->id);
            
            if(!is_null($rrule)) {
                $ics .= "$rrule\n";
            } 
		}
        $ics .= "DTSTAMP:$dtstamp\n";
        $ics .= "UID:$uid\n";
        $ics .= "CREATED:$dtstamp\n";
        $ics .= "DESCRIPTION:$description\n";
        $ics .= "LAST-MODIFIED:$lastModifiedTzFormat\n";
        $ics .= "SEQUENCE:$sequence\n";
        $ics .= "STATUS:CONFIRMED\n";
        $ics .= "SUMMARY:$summary\n";
        $ics .= "LOCATION:$address\n";
        $ics .= "URL:$eventUrl\n";

        $ics .= "BEGIN:VALARM\n";
        $ics .= "TRIGGER:-PT60M\n";
        $ics .= "REPEAT:2\n";
        $ics .= "DURATION:PT" . $alertTime . "M\n";
        $ics .= "ACTION:DISPLAY\n";
        //$ics .= "SUMMARY:$summary\n";
        //$ics .= "DESCRIPTION:$description\n";
        $ics .= "DESCRIPTION:$summary\n"; // because it's ACTION:DISPLAY
        $ics .= "END:VALARM\n";

        $ics .= "END:VEVENT\n";
    }
    $ics .= "END:VCALENDAR";

	header('Content-type: text/calendar; charset=utf-8');
	header('Content-Disposition: inline; filename=events.ics');
	echo Q_Utils::lineBreaks($ics);
	return false;
}