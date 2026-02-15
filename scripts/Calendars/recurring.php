<?php
date_default_timezone_set('UTC');
ini_set('max_execution_time', 0);

$FROM_APP = defined('RUNNING_FROM_APP'); //Are we running from app or framework?

if(!$FROM_APP) {
	die(PHP_EOL.PHP_EOL.'this script should be called from application');
}

// get recurring categories streams
$recurringCategories = Streams_Stream::select(array("publisherId", "name"))
    ->where(array(
        "type" => "Calendars/recurring",
        "closedTime" => null
    ))->execute()->fetchAll();

foreach ($recurringCategories as $recurringCategory) {
    // get recurring category stream
    $recurringStream = Streams_Stream::fetch($recurringCategory['publisherId'], $recurringCategory['publisherId'], $recurringCategory['name']);

	echo "Processing recurring category: ".$recurringStream->name."\n";

	// check recurring start time
	$startDate = $recurringStream->getAttribute("startDate");
	if (!empty($startDate) && strtotime($startDate) > time()) {
		echo "Start time has not come yet: ".$startDate."\n";
		continue;
	}

	// check recurring end time
	$endDate = $recurringStream->getAttribute("endDate");
	if (!empty($endDate) && strtotime($endDate) < time()) {
		echo "End time already passed: ".$endDate."\n";
		continue;
	}

    // get related streams
	$relatedStream = Calendars_Recurring::getLastStream($recurringStream);

	// if last stream absent
	if (!($relatedStream instanceof Streams_Stream) || !is_null($relatedStream->closedTime)) {
        continue;
    }

    echo "Processing recurring stream: ".$relatedStream->name."\n";

	try {
		// save new stream created to array with recurring stream name as key
		Q::event('Calendars/recurring/'.$relatedStream->type, @compact('relatedStream', 'recurringStream'));
	} catch(Exception $e) {
		echo $e->getMessage()."\n";
	}
}
