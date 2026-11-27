<?php

namespace go\core\webclient\neo;

use go\core\model\User;
use PHPUnit\Framework\TestCase;

class SchemaTest extends TestCase
{
	private static ?User $user = null;

	protected function setUp(): void
	{
		Schema::migrate(); // testUninstallDropsOnlyNeoTables drops the tables
	}

	public static function setUpBeforeClass(): void
	{
		$name = 'neoschema' . uniqid();
		self::$user = (new User())->setValues([
			'username' => $name,
			'displayName' => $name,
			'email' => $name . '@example.com',
			'password' => 'Pa55word!!xyz'
		]);
		self::assertTrue(self::$user->save(), var_export(self::$user->getValidationErrors(), true));
	}

	public static function tearDownAfterClass(): void
	{
		Schema::migrate();
		if (self::$user) {
			User::delete(['id' => self::$user->id]);
		}
	}

	private static function settingsRow(int $userId): ?array
	{
		return go()->getDbConnection()->select('*')->from('neo_tasks_user_settings')->where('userId', '=', $userId)->single();
	}

	private static function syncState(): string
	{
		return go()->getDbConnection()->query("SELECT CONCAT((SELECT SUM(highestModSeq) FROM core_entity), '/', (SELECT COUNT(*) FROM core_change))")->fetchColumn();
	}

	public function testMigrateRunsOnceAndIsIdempotent(): void
	{
		$this->assertSame(count(Schema::updates()), Schema::version());
		$this->assertTrue(go()->getDatabase()->hasTable('neo_tasks_user_settings'));
		$this->assertSame(0, Schema::migrate(), 'a second run runs nothing');

		// an update that ran already doesn't run again when neo_schema says so, a missing one does
		go()->getDbConnection()->update('neo_schema', ['version' => 0], ['id' => 1])->execute();
		$this->assertSame(count(Schema::updates()), Schema::migrate(), 'CREATE TABLE IF NOT EXISTS reruns safely');
		$this->assertSame(count(Schema::updates()), Schema::version());
	}

	public function testUserWithoutRowGetsDefaultsAndRowOnSave(): void
	{
		$id = self::$user->id;
		$this->assertNull(self::settingsRow($id));

		$user = User::findById($id);
		$this->assertNotNull($user->neoTasksSettings, 'auto created for a user without a row');
		$this->assertNull($user->neoTasksSettings->boardGroupBy);

		$user->setValues(['neoTasksSettings' => ['boardGroupBy' => 'progress', 'view' => 'board']]);
		$this->assertTrue($user->save(), var_export($user->getValidationErrors(), true));
		$this->assertSame('progress', self::settingsRow($id)['boardGroupBy']);
		$this->assertSame('board', self::settingsRow($id)['view']);

		$this->assertSame('progress', User::findById($id)->neoTasksSettings->boardGroupBy);
	}

	/**
	 * Writes a temporary module updates.php creating neo_test_neoschema_items with an FK to core_user
	 */
	private static function moduleUpdatesFile(int $count): string
	{
		$php = "<?php\n\$updates = [];\n"
			. "\$updates['202601010000'][] = \"CREATE TABLE IF NOT EXISTS `neo_test_neoschema_items` (`userId` INT(11) NOT NULL, "
			. "PRIMARY KEY (`userId`), CONSTRAINT `neo_test_neoschema_items_user` FOREIGN KEY (`userId`) REFERENCES `core_user` (`id`) ON DELETE CASCADE) ENGINE=InnoDB\";\n";
		if ($count > 1) {
			$php .= "\$updates['202601020000'][] = \"ALTER TABLE `neo_test_neoschema_items` ADD COLUMN IF NOT EXISTS `note` VARCHAR(16) NULL\";\n";
		}
		$file = sys_get_temp_dir() . '/neoschema' . uniqid() . '.php';
		file_put_contents($file, $php);
		return $file;
	}

	public function testModuleUpdatesRunOnceCountedPerModule(): void
	{
		$key = 'test/neoschema';
		$core = Schema::version();
		$file = self::moduleUpdatesFile(1);
		try {
			$this->assertSame(0, Schema::version($key));
			$this->assertSame(1, Schema::migrateFiles([$key => $file]));
			$this->assertTrue(go()->getDatabase()->hasTable('neo_test_neoschema_items'));
			$this->assertSame(1, Schema::version($key));
			$this->assertSame($core, Schema::version(), 'the core neo version is its own');
			$this->assertSame(0, Schema::migrateFiles([$key => $file]), 'a second run runs nothing');

			// a later update of the module runs alone
			rename(self::moduleUpdatesFile(2), $file);
			$this->assertSame(1, Schema::migrateFiles([$key => $file]));
			$this->assertSame(2, Schema::version($key));
			$this->assertSame(0, Schema::migrate(), 'migrate() does not reset the module row');
			$this->assertSame(2, Schema::version($key));

			// uninstall drops the module's tables and its neo_schema row with neo_schema
			$this->assertContains('neo_test_neoschema_items', Schema::uninstall());
			$this->assertFalse(go()->getDatabase()->hasTable('neo_test_neoschema_items'));
			$this->assertSame(0, Schema::version($key));
		} finally {
			unlink($file);
			Schema::uninstall(); // also after a failure: the test table and the test row; setUp() migrates again
		}
	}

	public function testUninstallDropsOnlyNeoTables(): void
	{
		$before = go()->getDbConnection()->query("SHOW TABLES")->fetchAll(\PDO::FETCH_COLUMN);
		$neo = array_values(array_filter($before, fn($t) => str_starts_with($t, 'neo_')));
		$this->assertContains('neo_schema', $neo);

		// rebuildCache() would reset the sync state: highestModSeq to 0, core_change emptied
		go()->getDbConnection()->exec("UPDATE core_entity SET highestModSeq = highestModSeq + 1 WHERE name = 'User'");
		$changes = self::syncState();
		$dropped = Schema::uninstall();
		$this->assertSame($changes, self::syncState(), 'no rebuildCache(): the sync state of upstream entities stays');
		sort($dropped);
		sort($neo);
		$this->assertSame($neo, $dropped);

		$after = go()->getDbConnection()->query("SHOW TABLES")->fetchAll(\PDO::FETCH_COLUMN);
		$this->assertSame(array_values(array_diff($before, $neo)), $after);
		$this->assertSame(0, Schema::version());
		$this->assertGreaterThanOrEqual(count(Schema::updates()), Schema::migrate(), 'plus the updates of installed modules');
		$this->assertSame(count(Schema::updates()), Schema::version());
		$this->assertSame($changes, self::syncState());
		Schema::uninstall();
		go()->getDbConnection()->exec("UPDATE core_entity SET highestModSeq = highestModSeq - 1 WHERE name = 'User'");

		// without the tables a User still loads, just without the neo property
		$user = User::findById(self::$user->id);
		$this->assertNotNull($user);
		$this->assertFalse(User::getMapping()->hasProperty('neoTasksSettings'));
		$this->assertTrue($user->save());
	}
}
