<?php
/**
 * Event attendees — table-based layout.
 *
 * Columns vary by permission level:
 *   Regular:  Name | Going | Paid
 *   Promoter: Name | Going | Invited By | Paid (own only)
 *   Admin:    Name | Going | Invited By | Paid
 */
$showInviter = ($isAdmin || $isPromoter);
$showPaymentColumn = true; // column always present; cells may be empty per visibility
?>
<div class="Calendars_attendees">

	<div class="Calendars_attendees_summary">
		<div class="Calendars_attendees_stat">
			<span class="Calendars_attendees_number"><?php echo $summary['total'] ?></span>
			<span class="Calendars_attendees_label">attendees</span>
		</div>
		<div class="Calendars_attendees_stat">
			<span class="Calendars_attendees_number"><?php echo $summary['going'] ?></span>
			<span class="Calendars_attendees_label">going</span>
		</div>
		<?php if ($isAdmin): ?>
		<div class="Calendars_attendees_stat">
			<span class="Calendars_attendees_number"><?php echo $summary['paid'] ?></span>
			<span class="Calendars_attendees_label">paid</span>
		</div>
		<div class="Calendars_attendees_stat">
			<span class="Calendars_attendees_number">$<?php echo number_format($summary['totalCharged'], 2) ?></span>
			<span class="Calendars_attendees_label">charged</span>
		</div>
		<?php endif; ?>
	</div>

	<?php if (empty($rows)): ?>
		<div class="Calendars_attendees_empty">No attendees to show.</div>
	<?php else: ?>

	<table class="Calendars_attendees_table">
		<thead>
			<tr>
				<th class="Calendars_attendees_th_name">Name</th>
				<th class="Calendars_attendees_th_going">Going</th>
				<?php if ($showInviter): ?>
				<th class="Calendars_attendees_th_inviter">Invited By</th>
				<?php endif; ?>
				<th class="Calendars_attendees_th_paid">Paid</th>
			</tr>
		</thead>
		<tbody>
		<?php
		$prevMine = null;
		foreach ($rows as $row):
			// section separator between own invitees and the rest
			if ($prevMine !== null && $prevMine && !$row['isMine'] && ($isAdmin || $isPromoter)):
		?>
			<tr class="Calendars_attendees_separator">
				<td colspan="<?php echo $showInviter ? 4 : 3 ?>">
					<span>Other attendees</span>
				</td>
			</tr>
		<?php endif; $prevMine = $row['isMine']; ?>
			<tr class="Calendars_attendees_row<?php echo $row['isMine'] ? ' Calendars_attendees_mine' : '' ?>"
				data-user-id="<?php echo Q_Html::text($row['userId']) ?>">
				<td class="Calendars_attendees_td_name">
					<?php echo Q::tool('Users/avatar', array(
						'userId' => $row['userId'],
						'icon' => 40,
						'short' => true
					), 'att-' . $row['userId']) ?>
				</td>
				<td class="Calendars_attendees_td_going">
					<span class="Calendars_attendees_badge Calendars_attendees_going_<?php
						echo Q_Html::text($row['going']) ?>"><?php
						echo ucfirst($row['going']) ?></span>
				</td>
				<?php if ($showInviter): ?>
				<td class="Calendars_attendees_td_inviter"><?php
					if ($row['isMine']) {
						echo '<span class="Calendars_attendees_you">You</span>';
					} elseif ($row['inviterName']) {
						echo Q_Html::text($row['inviterName']);
					} else {
						echo '<span class="Calendars_attendees_dash">&mdash;</span>';
					}
				?></td>
				<?php endif; ?>
				<td class="Calendars_attendees_td_paid"><?php
					if ($row['canSeePayment']) {
						if ($row['paid'] > 0) {
							echo '<span class="Calendars_attendees_paid">$'
								. number_format($row['paid'], 2) . '</span>';
						} else {
							echo '<span class="Calendars_attendees_unpaid">—</span>';
						}
					}
				?></td>
			</tr>
		<?php endforeach; ?>
		</tbody>
	</table>

	<?php endif; ?>
</div>
