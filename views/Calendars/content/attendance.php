<div class="Calendars_attendance_page">
	<h1 class="Calendars_attendance_eventTitle">
		<?php echo Q_Html::text($stream->title) ?>
	</h1>
	<?php echo Q::tool("Calendars/attendance", array(
		'publisherId' => $stream->publisherId,
		'streamName' => $stream->name
	)) ?>
</div>
