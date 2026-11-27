<?php
namespace go\core\cli\controller;

use go\core\Controller;
use go\core\webclient\neo\Schema;

/**
 * Database tables of the neo web client
 *
 * docker compose exec --user www-data groupoffice php ./www/cli.php core/Neo/migrate
 */
class Neo extends Controller {

	/**
	 * Runs the neo schema updates that haven't run yet (also done on upgrade and on the neo page)
	 */
	public function migrate(): void
	{
		echo "Ran " . Schema::migrate() . " neo update queries, version " . Schema::version() . "\n";
	}

	/**
	 * Drops every neo_* table including neo_schema, so the database is a classic GroupOffice database again
	 */
	public function uninstall(): void
	{
		$tables = Schema::uninstall();
		echo "Dropped " . count($tables) . " neo tables" . ($tables ? ": " . implode(", ", $tables) : "") . "\n";
	}
}
