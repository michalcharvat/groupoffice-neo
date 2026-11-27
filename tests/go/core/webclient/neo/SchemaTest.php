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
		$this->assertSame(count(Schema::updates()), Schema::migrate());
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
