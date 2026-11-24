<?php
/** @var array $data */
extract($data);
/** @var int $count */
/** @var string $html */

\go\core\webclient\Page::header();
?>
<section><fieldset>
		<div id="reminderText">
		<?php
			$reminders= $count==1 ? \GO::t("1 reminder") : sprintf(\GO::t("%s reminders"), $count);
			
			if($count>0)
				echo '<p>'.sprintf(\GO::t("You have %s in %s."), $reminders, \GO::config()->product_name).'</p>';
			
			echo $html;

		?>
		</div>
</fieldset></section>
<?php
\go\core\webclient\Page::footer();
?>
