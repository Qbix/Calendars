<?php

/**
 * @module Calendars
 */

/**
 * Allows labels from Calendars/events/admins download of sample csv and upload a filled-out csv.
 * The upload starts a Streams/task where Streams/import handler runs and creates
 * events from the csv.
 * It also listens to Streams/task/progress messages on the task, displays progress
 * and provides a way to send mass messages to follow up the invitation messages.
 * @class HTTP Calendars import
 * @method post
 * @param {array} [$_REQUEST]
 * @param {string} [$_REQUEST.communityId=Users::communityId] If you want to override it
 * @param {string} [$_REQUEST.taskStreamName] Pass the name of a task stream to resume it.
 *    In this case, you don't need to pass the file, because it was saved.
 * @param {array} [$_FILES] Array consisting of one or more CSV files.
 *  The first line consists of titles or names of streams loaded from
 *  JSON files named under Streams/userStreams config.
 * @throws Users_Exception_NotAuthorized
 */
function Calendars_import_post()
{
	$luid = Users::loggedInUser(true)->id;
	$communityId = Q::ifset($_REQUEST, 'communityId', Users::communityId());
	$taskStreamName = Q::ifset($_REQUEST, 'taskStreamName', null);
	if (empty($taskStreamName)) {
		throw new Exception("field taskStreamName required");
	}

	$content = Q_Text::get('Calendars/content');
	$texts = $content['import'];

	// check permissions
	$authorized = Users_Label::can($communityId, $luid);
	$authorized = Q::ifset($authorized, "manageEvents", false);
	if (empty($authorized)) {
		throw new Users_Exception_NotAuthorized();
	}

	// get the instructions from uploaded file
	if (!empty($_FILES)) {
		$file = reset($_FILES);
		$tmp = $file['tmp_name'];

		// create array of csv lines from file
		$handle = fopen($tmp,'r');
		$instructions = array();
		while (($data = fgetcsv($handle)) !== FALSE ) {
			$instructions[] = $data;
		}

		if (empty($instructions)) {
			throw new Exception($texts['fileEmpty']);
		}

		// encode to json to save it to DB
		$instructions = json_encode($instructions);

		if (empty($instructions)) {
			throw new Exception($texts['fileEmpty']);
		}
	}

	$taskStream = Streams_Stream::fetch($luid, $luid, $taskStreamName);
	if (!$taskStream) {
		throw new Exception($texts['taskStreamInvalid']);
	}

	$taskStream->setAttribute("communityId", $communityId);
	$taskStream->setAttribute("toMainCommunityToo", Q::ifset($_REQUEST, 'toMainCommunityToo', false));

	// if task stream not related to global category
	Streams::relate(
		null,
		Q::app(),
		"Streams/tasks/app",
		'Calendars/import',
		$taskStream->publisherId,
		$taskStream->name,
		array(
			'skipAccess' => true,
			'weight' => time()
		)
	);

	// if new file uploaded, replace instructions in task stream
	if (!empty($instructions)) {
		$taskStream->instructions = $instructions;
		$taskStream->save();
	}

	// task stream reusing
	if ($taskStream->getAttribute('complete') == 1) {
		$taskStream->clearAllAttributes();
		$taskStream->save();
	}

	// call import only when task stream created and instructions loaded
	Calendars_Event::import($taskStream);
}