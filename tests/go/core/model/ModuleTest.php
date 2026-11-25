<?php

namespace go\core\model;

use go\core\auth\TemporaryState;
use PHPUnit\Framework\TestCase;

/**
 * A Module loaded with only some properties (Module/get with "properties") must still know its package, otherwise
 * isAvailable() is false and getUserRights() caches "no access" for the rest of the request.
 */
class ModuleTest extends TestCase
{
	private static User $user;
	private static Group $group;
	private static $classAuthState;
	private $authState;

	public static function setUpBeforeClass(): void
	{
		self::$classAuthState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		try {
			$name = uniqid('modtest');
			self::$group = new Group();
			self::$group->name = $name . 'group';
			if (!self::$group->save()) {
				throw new \Exception(self::$group->getValidationErrorsAsString());
			}

			self::$user = new User();
			self::$user->setValues([
				'username' => $name,
				'displayName' => $name,
				'email' => $name . '@example.com',
				'password' => 'Pa55word!!xyz'
			]);
			self::$user->groups = [Group::ID_EVERYONE, self::$group->id];
			if (!self::$user->save()) {
				throw new \Exception(self::$user->getValidationErrorsAsString());
			}

			$calendar = Module::findByName('community', 'calendar');
			$calendar->permissions[self::$group->id] = new Permission($calendar);
			if (!$calendar->save()) {
				throw new \Exception("Could not grant the calendar module");
			}
		} catch (\Throwable $e) {
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		try {
			self::cleanUp();
		} finally {
			go()->setAuthState(self::$classAuthState);
		}
	}

	private static function cleanUp(): void
	{
		if (isset(self::$group)) {
			$calendar = Module::findByName('community', 'calendar');
			if (isset($calendar->permissions[self::$group->id])) {
				unset($calendar->permissions[self::$group->id]);
				$calendar->save();
			}
		}
		if (isset(self::$user)) {
			User::delete(['id' => self::$user->id]);
		}
		if (isset(self::$group)) {
			Group::delete(['id' => self::$group->id]);
		}
	}

	protected function setUp(): void
	{
		$this->authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(self::$user->id));
		$this->resetRightsCache();
	}

	protected function tearDown(): void
	{
		go()->setAuthState($this->authState);
		$this->resetRightsCache();
	}

	private function resetRightsCache(): void
	{
		(new \ReflectionProperty(Module::class, 'userRightsCache'))->setValue(null, []);
	}

	public function testPartialModuleKeepsRights(): void
	{
		$partial = Module::find(['id', 'settings'])->where(['package' => 'community', 'name' => 'calendar'])->single();
		$this->assertNotNull($partial);
		$this->assertSame('community', $partial->package);
		$this->assertTrue($partial->isAvailable());
		$this->assertTrue($partial->getUserRights()->mayRead);

		// the cache must not hold "no access" for the full module either
		$this->assertTrue(Module::isAvailableFor('community', 'calendar'));
	}

	public function testPartialModuleReturnsSettings(): void
	{
		$partial = Module::find(['id', 'settings'])->where(['package' => 'community', 'name' => 'addressbook'])->single();
		$this->assertNotNull($partial->getSettings());
	}

	public function testPartialModuleKeepsEnabledFlag(): void
	{
		$db = go()->getDbConnection();
		$db->insert('core_module', ['name' => 'moduletestdisabled', 'package' => 'test', 'version' => 0, 'enabled' => false])->execute();
		$id = (int) $db->getPDO()->lastInsertId();
		try {
			$partial = Module::find(['id', 'settings'])->where(['id' => $id])->single();
			$this->assertFalse($partial->enabled);
		} finally {
			$db->delete('core_module', ['id' => $id])->execute();
		}
	}
}
