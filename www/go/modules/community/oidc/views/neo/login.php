<?php
/**
 * "Sign in with ..." buttons of the neo login screen (go\core\webclient\Neo::loginButtons()),
 * like Module::onHead() adds them to the ExtJS login dialog
 */

use go\modules\community\oidc\model\Client;

$buttons = [];
foreach (Client::find()->orderBy(['name' => 'DESC'])->all() as $client) {
	$buttons[] = [
		'text' => str_replace('{name}', $client->name, go()->t("Sign in with {name}")),
		'url' => 'api/page.php/community/oidc/auth/' . $client->id
	];
}
return $buttons;
