<?php

namespace go\core\webclient\neo;

use go\core\Installer;
use go\core\model\Module;
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
		foreach (self::USER_PROPERTIES as $name => [$cls, $table]) {
			self::addProperty($mapping, $name, $cls, $table, ['id' => 'userId']);
		}
	}

	/**
	 * Adds a property over a neo_* table to an entity mapping, only when the table exists (before the migration
	 * the entity works without it). The related row is created with its defaults when the property is saved.
	 *
	 * Call it from an {@see Property::EVENT_MAPPING} listener; a module registers that listener only when
	 * `class_exists(Schema::class)`, so it stays inert on GroupOffice without neo (docs/neo-core-components.md).
	 *
	 * @param string $name property name on the entity
	 * @param class-string<Property> $cls the Property class over $table
	 * @param array<string, string> $keys entity column => $table column
	 */
	public static function addProperty(Mapping $mapping, string $name, string $cls, string $table, array $keys): void
	{
		if (go()->getDatabase()->hasTable($table)) {
			$mapping->add($name, Relation::one($cls, true)->keys($keys));
		}
	}

	/**
	 * All update queries of core neo (SQL strings or callables) in the order they run
	 */
	public static function updates(): array
	{
		return self::loadUpdates(__DIR__ . '/install/updates.php');
	}

	/**
	 * Update queries of one updates.php file, sorted by their timestamp key
	 */
	private static function loadUpdates(string $file): array
	{
		$updates = [];
		require $file;
		ksort($updates);
		return array_merge([], ...array_values($updates));
	}

	/**
	 * views/neo/install/updates.php of every installed, available and allowed module that has one, keyed "package/name"
	 * (package "legacy" for modules without one)
	 *
	 * @return array<string, string> module key => file path
	 */
	public static function moduleUpdateFiles(): array
	{
		$files = [];
		foreach (Module::getInstalled() as $module) {
			// getInstalled() doesn't apply config.php allowed_modules for legacy modules
			if (!\go\core\Module::isAllowed($module->name, $module->package)) {
				continue;
			}
			$file = $module->folder()->getFile('views/neo/install/updates.php');
			if ($file->exists()) {
				$files[($module->package ?? 'legacy') . '/' . $module->name] = $file->getPath();
			}
		}
		return $files;
	}

	/**
	 * Number of update queries run on this database per module key ('' for core neo), empty when neo_schema doesn't
	 * exist yet
	 *
	 * @return array<string, int>
	 */
	private static function versions(): array
	{
		// no Database::hasTable(): clearing its table cache would evict the cached table definitions on every page
		$conn = go()->getDbConnection();
		if (!$conn->query("SHOW TABLES LIKE 'neo\\_schema'")->fetchColumn()) {
			return [];
		}
		$versions = [];
		// SELECT *: the module column is added by a core neo update, the core row (id 1) has module NULL
		foreach ($conn->query("SELECT * FROM `neo_schema`")->fetchAll(\PDO::FETCH_ASSOC) as $row) {
			$versions[$row['module'] ?? ''] = (int) $row['version'];
		}
		return $versions;
	}

	/**
	 * Number of update queries run on this database for core neo or a module ("package/name"), 0 when none ran
	 */
	public static function version(string $module = ''): int
	{
		return self::versions()[$module] ?? 0;
	}

	/**
	 * Runs the updates of core neo and of every installed module that haven't run yet
	 *
	 * @return int number of queries run
	 */
	public static function migrate(): int
	{
		return self::migrateFiles(['' => __DIR__ . '/install/updates.php'] + self::moduleUpdateFiles());
	}

	/**
	 * Runs the updates of the given files that haven't run yet, saving the version after every query so a failed
	 * one runs again next time. Does nothing when another request is migrating.
	 *
	 * @param array<string, string> $files module key => updates.php; core neo ('') must come first, it creates
	 *   neo_schema.module
	 * @return int number of queries run
	 */
	public static function migrateFiles(array $files): int
	{
		$versions = self::versions();
		$all = [];
		$pending = false;
		foreach ($files as $key => $file) {
			$all[$key] = self::loadUpdates($file);
			$pending = $pending || ($versions[$key] ?? 0) < count($all[$key]);
		}
		if (!$pending) {
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

			// all files, not only those pending before the lock: an uninstall meanwhile resets core neo as well
			foreach ($all as $key => $updates) {
				if ($key === '') {
					$save = $conn->getPDO()->prepare("UPDATE `neo_schema` SET `version` = ? WHERE `id` = 1");
					$args = [];
				} else {
					// plain SQL, not the query builder: it checks columns against the cached table definition, which
					// doesn't know neo_schema.module when the core update adding it ran in this same call
					$conn->getPDO()->prepare("INSERT IGNORE INTO `neo_schema` (`module`, `version`) VALUES (?, 0)")->execute([$key]);
					$save = $conn->getPDO()->prepare("UPDATE `neo_schema` SET `version` = ? WHERE `module` = ?");
					$args = [$key];
				}
				// read again under the lock: another request may have run them meanwhile
				for ($i = self::version($key); $i < count($updates); $i++) {
					is_callable($updates[$i]) ? call_user_func($updates[$i]) : $conn->exec($updates[$i]);
					$save->execute([$i + 1, ...$args]);
					$run++;
				}
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
	 * Drops every neo_* table of core neo and of the modules, including neo_schema, leaving a classic GroupOffice database
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
