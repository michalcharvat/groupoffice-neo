<?php
/**
 * "Sign in with ..." buttons of the neo login screen (go\core\webclient\Neo::loginButtons())
 * for the OpenID clients, like Module::onHead() adds them to the ExtJS login dialog
 */

use go\modules\community\oauth2client\model\Oauth2Client;

$buttons = [];
foreach (Oauth2Client::find()->where('openId', '=', true)->all() as $client) {
	$buttons[] = [
		'text' => str_replace('{name}', $client->name, go()->t("Sign in with {name}", "community", "oauth2client")),
		'url' => 'go/modules/community/oauth2client/gauth.php/openid/' . $client->id
	];
}
return $buttons;
