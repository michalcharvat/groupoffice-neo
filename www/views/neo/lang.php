<?php
/**
 * Translations for the neo webclient: JSON of all language sections,
 * {package: {module: {key: text}}}. See go\core\webclient\Neo::getLanguageFile().
 */

use go\core\App;
use go\core\webclient\Neo;

require(__DIR__ . "/../../vendor/autoload.php");
App::get();

if (isset($_GET['lang']) && is_string($_GET['lang']) && go()->getLanguage()->hasLanguage($_GET['lang'])) {
	go()->getLanguage()->setLanguage($_GET['lang']);
}

Neo::get()->getLanguageFile()->output(true, true, [
	"Content-Type" => "application/json; charset=utf-8",
	// the URL carries the file's mtime
	"Expires" => (new DateTime("1 year"))->format("D, j M Y H:i:s")
], true);
