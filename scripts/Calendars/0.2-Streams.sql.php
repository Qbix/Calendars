<?php
	
function Calendars_0_2_Streams()
{
	// get all relations
	$relations = Streams_RelatedTo::select()
		->where(array(
			'toStreamName LIKE ' => "Streams/experience%",
			'type' => "Calendars/event"
		))
		->execute()
		->fetchAll(PDO::FETCH_ASSOC);

	foreach($relations as $relation){
		$experienceId = preg_replace("/^.*\//", "", $relation["toStreamName"]);
		$categoryStreamType = $relation["type"];
		$categoryStreamName = $categoryStreamType . "/" . $experienceId;
		$categoryStreamPublisherId = $relation["toPublisherId"];

		// get or create category stream
		$categoryStream = Streams_Stream::fetch($categoryStreamPublisherId, $categoryStreamPublisherId, $categoryStreamName);
		if (empty($categoryStream)) {
			$categoryStream = Streams::create($categoryStreamPublisherId, $categoryStreamPublisherId, $categoryStreamType, array(
				"name" => $categoryStreamName
			));
		}

		// relate to new category
		Streams::relate(
			$relation["fromPublisherId"],
			$categoryStream->publisherId,
			$categoryStream->name,
			$relation["type"],
			$relation["fromPublisherId"],
			$relation["fromStreamName"],
			array(
				"skipAccess" => true,
				"skipMessageTo" => true,
				"skipMessageFrom" => true
			)
		);

		// unrelate from old category
		Streams::unrelate(
			$relation["fromPublisherId"],
			$relation["toPublisherId"],
			$relation["toStreamName"],
			$relation["type"],
			$relation["fromPublisherId"],
			$relation["fromStreamName"],
			array(
				"skipAccess" => true,
				"skipMessageTo" => true,
				"skipMessageFrom" => true
			)
		);

		echo ".";
	}
}

Calendars_0_2_Streams();