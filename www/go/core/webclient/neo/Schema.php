<?php

namespace go\core\webclient\neo;

use go\core\Installer;
use go\core\model\User;
use go\core\orm\Mapping;
use go\core\orm\Property;
use go\core\orm\Relation;
use go\core\util\Lock;
use go\core\webclient\neo\model\TasksUserSettings;

/**
 * Database tables of the neo web client: own migrations, own version, uninstall
 *
 * neo only adds neo_* tables and never touches an upstream table, so dropping them leaves a clean GroupOffice
 * database. The updates are in install/updates.php, the number of queries run is in neo_schema, not in
 * core_module.version (GroupOffice counts its update queries by position).
 */
final class Schema {

	/**
	 * User properties of neo: name => [Property class, table]
	 */
	private const USER_PROPERTIES = [
		'neoTasksSettings' => [TasksUserSettings::class, 'neo_tasks_user_settings'],
	];

	/**
	 * Registers the listeners of neo, called from {@see \go\core\App::defineListeners()}
	 */
	public static function defineListeners(): void
	{
		Installer::on(Installer::EVENT_UPGRADE, static::class, 'migrate');
		User::on(Property::EVENT_MAPPING, static::class, 'onUserMapping');
	}

	/**
	 * Hangs the neo user properties on User, but only those whose table exists, so a request before the migration
	 * still works (without the property)
	 */
	public static function onUserMapping(Mapping $mapping): void
	{
		$db = go()->getDatabase();
		foreach (self::USER_PROPERTIES as $name => [$cls, $table]) {
			if ($db->hasTable($table)) {
				$mapping->add($name, Relation::one($cls, true)->keys(['id' => 'userId']));
			}
		}
	}

	/**
	 * All update queries (SQL strings or callables) in the order they run
	 */
	public static function updates(): array
	{
		$updates = [];
		require __DIR__ . '/install/updates.php';
		ksort($updates);
		return array_merge([], ...array_values($updates));
	}

	/**
	 * Number of update queries run on this database, 0 when neo_schema doesn't exist yet
	 */
	public static function version(): int
	{
		// no Database::hasTable(): clearing its table cache would evict the cached table definitions on every page
		$conn = go()->getDbConnection();
		if (!$conn->query("SHOW TABLES LIKE 'neo\\_schema'")->fetchColumn()) {
			return 0;
		}
		return (int) go()->getDbConnection()->selectSingleValue('version')->from('neo_schema')->where('id', '=', 1)->single();
	}

	/**
	 * Runs the updates that haven't run yet, saving the version after every query so a failed one runs again next
	 * time. Does nothing when another request is migrating.
	 *
	 * @return int number of queries run
	 */
	public static function migrate(): int
	{
		$updates = self::updates();
		if (self::version() >= count($updates)) {
			return 0;
		}

		// shortcut: the lock is per host (semaphore), fine for one application server; the updates must tolerate a rerun
		$lock = new Lock('neo-schema', false);
		if (!$lock->lock()) {
			return 0;
		}

		$conn = go()->getDbConnection();
		$run = 0;
		try {
			$conn->exec("CREATE TABLE IF NOT EXISTS `neo_schema` (
				`id` TINYINT UNSIGNED NOT NULL,
				`version` INT UNSIGNED NOT NULL DEFAULT 0,
				PRIMARY KEY (`id`)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
			$conn->insertIgnore('neo_schema', ['id' => 1, 'version' => 0])->execute();

			for ($i = self::version(); $i < count($updates); $i++) {
				is_callable($updates[$i]) ? call_user_func($updates[$i]) : $conn->exec($updates[$i]);
				$conn->update('neo_schema', ['version' => $i + 1], ['id' => 1])->execute();
				$run++;
			}
		} finally {
			$lock->unlock();
			if ($run) {
				// cached mappings (User without neo properties) and table definitions are stale now; not
				// rebuildCache(), which also resets the sync state (core_change) of every entity
				go()->clearCache();
			}
		}

		return $run;
	}

	/**
	 * Drops every neo_* table including neo_schema, leaving a classic GroupOffice database
	 *
	 * @return string[] the dropped tables
	 */
	public static function uninstall(): array
	{
		$lock = new Lock('neo-schema'); // waits for a running migration
		$lock->lock();

		$conn = go()->getDbConnection();
		$oldFkChecks = $conn->foreignKeyChecks(false);
		try {
			$tables = $conn->query("SHOW TABLES LIKE 'neo\\_%'")->fetchAll(\PDO::FETCH_COLUMN);
			foreach ($tables as $table) {
				$conn->exec("DROP TABLE `" . str_replace('`', '``', $table) . "`");
			}
		} finally {
			$conn->foreignKeyChecks($oldFkChecks);
			$lock->unlock();
			go()->clearCache();
		}

		return $tables;
	}
}
