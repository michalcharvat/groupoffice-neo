<?php
namespace go\core\webclient;

use GO;
use go\core\auth\TemporaryState;
use go\core\model\Group;
use go\core\model\User;
use PHPUnit\Framework\TestCase;

/**
 * Classic-only apps that the neo apps menu offers (docs/neo-switch.md, D3)
 */
class NeoTest extends TestCase
{
	private static ?User $everyoneOnly = null;

	public static function setUpBeforeClass(): void
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));

		try {
			// only in "Everyone": no access to modules that only "Internal" may read
			$name = uniqid('neoclassic');
			$user = new User();
			$user->setValues([
				'username' => $name,
				'displayName' => $name,
				'email' => $name . '@example.com',
				'password' => 'Pa55word!!xyz'
			]);
			$user->groups = [Group::ID_EVERYONE];
			self::assertTrue($user->save(), var_export($user->getValidationErrors(), true));
			self::$everyoneOnly = $user;
		} finally {
			go()->setAuthState($authState);
		}
	}

	public static function tearDownAfterClass(): void
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		if (self::$everyoneOnly) {
			User::delete(['id' => self::$everyoneOnly->id]);
		}
		go()->setAuthState($authState);
	}

	private static function legacyModule(string $name)
	{
		foreach (GO::modules()->getAllModules(true) as $module) {
			if ($module->name === $name) {
				return $module;
			}
		}
		return null;
	}

	/**
	 * @return string[] names of the classic apps of a user
	 */
	private function appsOf(int $userId): array
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState($userId));
		try {
			return array_column(Neo::get()->classicApps(), 'name');
		} finally {
			go()->setAuthState($authState);
		}
	}

	public function testMainPanelRegistrationsAreFound(): void
	{
		$bookmarks = self::legacyModule('bookmarks');
		$this->assertNotNull($bookmarks, 'bookmarks module is installed');
		// go.Modules.register(…, {mainPanel: …}) in views/extjs3/Module.js
		$this->assertSame(['route' => 'bookmarks', 'level' => 10], Extjs3::get()->classicMainPanel($bookmarks));

		// a module whose only mainPanel line is commented out
		$wopi = self::legacyModule('wopi');
		if ($wopi) {
			$this->assertNull(Extjs3::get()->classicMainPanel($wopi));
		}
	}

	public function testOnlyModulesTheUserMayReadAreListed(): void
	{
		$this->assertContains('bookmarks', $this->appsOf(User::ID_SUPER_ADMIN));
		// the guard: "Everyone" has no read permission on bookmarks
		$this->assertNotContains('bookmarks', $this->appsOf(self::$everyoneOnly->id));
	}

	public function testAppsCarryTheirEntities(): void
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		try {
			$apps = array_column(Neo::get()->classicApps(), null, 'name');
		} finally {
			go()->setAuthState($authState);
		}
		$this->assertContains('Bookmark', $apps['bookmarks']['entities'] ?? []);
	}
}
