<?php
namespace go\modules\community\emailfavorites\controller;

use go\core\auth\TemporaryState;
use go\core\model\Module as ModuleModel;
use go\core\orm\EntityType;
use go\core\model\Permission;
use go\core\model\User;
use go\modules\community\emailfavorites\Module;
use go\modules\community\emailfavorites\model\Favoritefolder as FavoritefolderModel;
use PHPUnit\Framework\TestCase;

/**
 * Favorite folders are personal: other users may not find, read or take over them.
 */
class FavoritefolderTest extends TestCase
{
	private static bool $installedByTest = false;
	private static User $owner;
	private static User $other;
	private $authState;
	private FavoritefolderModel $favorite;

	public static function setUpBeforeClass(): void
	{
		$authState = go()->getAuthState();
		self::actAs(User::ID_SUPER_ADMIN);
		try {
			$installed = ModuleModel::findByName('community', 'emailfavorites', null);
			if ($installed && !$installed->enabled) {
				self::markTestSkipped('The emailfavorites module is installed but disabled');
			}
			if (!$installed) {
				self::assertNotFalse(Module::get()->install(), 'Could not install the emailfavorites module');
				self::$installedByTest = true;
			}
			self::$owner = self::newUser();
			self::$other = self::newUser();

			$module = ModuleModel::findByName('community', 'emailfavorites');
			foreach ([self::$owner, self::$other] as $user) {
				$module->permissions[$user->getPersonalGroup()->id] = (new Permission($module))->setRights(['mayRead' => true]);
			}
			self::assertTrue($module->save(), $module->getValidationErrorsAsString());
		} catch (\Throwable $e) {
			self::tearDownAfterClass();
			throw $e;
		} finally {
			go()->setAuthState($authState);
		}
	}

	public static function tearDownAfterClass(): void
	{
		$authState = go()->getAuthState();
		self::actAs(User::ID_SUPER_ADMIN);

		$ids = [];
		foreach (['owner', 'other'] as $prop) {
			if (isset(self::$$prop)) {
				$ids[] = self::$$prop->id;
			}
		}
		if ($ids) {
			// the module permissions of the personal groups go with the users
			// the favorites reference the user without ON DELETE CASCADE
			FavoritefolderModel::delete(['userId' => $ids]);
			User::delete(['id' => $ids]);
		}

		if (self::$installedByTest) {
			// Module::uninstall() switches off change tracking and history without switching them on again
			$trackChanges = \go\core\jmap\Entity::$trackChanges;
			$history = \go\modules\community\history\Module::$enabled;
			try {
				self::$installedByTest = false;
				self::assertNotFalse(Module::get()->uninstall(), 'Could not uninstall the emailfavorites module');
			} finally {
				\go\core\jmap\Entity::$trackChanges = $trackChanges;
				\go\modules\community\history\Module::$enabled = $history;
				go()->setAuthState($authState);
			}
		}

		go()->setAuthState($authState);
	}

	protected function setUp(): void
	{
		$this->authState = go()->getAuthState();
		self::actAs(self::$owner->id);

		$this->favorite = new FavoritefolderModel();
		$this->favorite->userId = self::$owner->id;
		$this->favorite->account_id = 1;
		$this->favorite->mailbox = 'INBOX';
		$this->favorite->name = 'Inbox';
		$this->assertTrue($this->favorite->save(), $this->favorite->getValidationErrorsAsString());
	}

	protected function tearDown(): void
	{
		self::actAs(User::ID_SUPER_ADMIN);
		FavoritefolderModel::delete(['id' => $this->favorite->id]);
		go()->setAuthState($this->authState);
	}

	private static function newUser(): User
	{
		$name = uniqid('emfavuser');
		$user = new User();
		$user->setValues([
			'username' => $name,
			'displayName' => $name,
			'email' => $name . '@example.com',
			'password' => 'Pa55word!!xyz'
		]);
		self::assertTrue($user->save(), $user->getValidationErrorsAsString());
		return $user;
	}

	private static function actAs(int $userId): void
	{
		go()->setAuthState(new TemporaryState($userId));
	}

	public function testOwnerFindsFavorite(): void
	{
		$ids = array_map('intval', (new Favoritefolder())->query([])->getArray()['ids']);
		$this->assertContains((int) $this->favorite->id, $ids);
	}

	public function testQueryDoesNotReturnFavoritesOfOthers(): void
	{
		self::actAs(self::$other->id);
		$ids = array_map('intval', (new Favoritefolder())->query([])->getArray()['ids']);
		$this->assertNotContains((int) $this->favorite->id, $ids);

		// not even when filtering on the owner
		$ids = array_map('intval', (new Favoritefolder())->query(['filter' => ['userId' => self::$owner->id]])->getArray()['ids']);
		$this->assertNotContains((int) $this->favorite->id, $ids);
	}

	public function testGetWithoutIdsDoesNotReturnFavoritesOfOthers(): void
	{
		self::actAs(self::$other->id);
		$list = (new Favoritefolder())->get([])->getArray()['list'];
		$this->assertNotContains((int) $this->favorite->id, array_map('intval', array_column($list, 'id')));
	}

	public function testOtherUserCannotTakeOverFavorite(): void
	{
		self::actAs(self::$other->id);
		$result = (new Favoritefolder())->set(['update' => [$this->favorite->id => ['userId' => self::$other->id, 'name' => 'Mine']]])->getArray();

		$this->assertArrayHasKey($this->favorite->id, $result['notUpdated'] ?? [], var_export($result, true));
		$stored = FavoritefolderModel::findById($this->favorite->id);
		$this->assertEquals(self::$owner->id, $stored->userId);
		$this->assertEquals('Inbox', $stored->name);
	}

	public function testOwnerCanRenameFavorite(): void
	{
		$result = (new Favoritefolder())->set(['update' => [$this->favorite->id => ['name' => 'Renamed']]])->getArray();

		$this->assertArrayHasKey($this->favorite->id, $result['updated'] ?? [], var_export($result, true));
		$this->assertEquals('Renamed', FavoritefolderModel::findById($this->favorite->id)->name);
	}

	public function testOtherUserCannotCreateFavoriteForOwner(): void
	{
		self::actAs(self::$other->id);
		$result = (new Favoritefolder())->set(['create' => ['new' => [
			'userId' => self::$owner->id,
			'account_id' => 1,
			'mailbox' => 'Spam',
			'name' => 'Spam'
		]]])->getArray();

		$this->assertArrayHasKey('new', $result['notCreated'] ?? [], var_export($result, true));
		$this->assertEquals('forbidden', $result['notCreated']['new']->type);
	}

	public function testUserCanCreateOwnFavorite(): void
	{
		$result = (new Favoritefolder())->set(['create' => ['new' => [
			'userId' => self::$owner->id,
			'account_id' => 1,
			'mailbox' => 'Spam',
			'name' => 'Spam'
		]]])->getArray();

		$this->assertArrayHasKey('new', $result['created'] ?? [], var_export($result, true));
		// tearDownAfterClass() deletes the favorites of the test users
	}

	public function testChangesDoNotReturnFavoritesOfOthers(): void
	{
		EntityType::push();
		$since = FavoritefolderModel::getState();

		// the owner changes one favorite and creates and destroys another
		$this->favorite->name = 'Changed';
		$this->assertTrue($this->favorite->save(), $this->favorite->getValidationErrorsAsString());
		$destroyed = new FavoritefolderModel();
		$destroyed->userId = self::$owner->id;
		$destroyed->account_id = 1;
		$destroyed->mailbox = 'Trash';
		$destroyed->name = 'Trash';
		$this->assertTrue($destroyed->save(), $destroyed->getValidationErrorsAsString());
		EntityType::push();
		$this->assertTrue(FavoritefolderModel::delete(['id' => $destroyed->id]));
		EntityType::push();

		self::actAs(self::$other->id);
		$result = (new Favoritefolder())->changes(['sinceState' => $since])->getArray();
		$ids = array_map('intval', array_merge($result['changed'], $result['removed']));
		$this->assertNotContains((int) $this->favorite->id, $ids, var_export($result, true));
		$this->assertNotContains((int) $destroyed->id, $ids, var_export($result, true));
		// the client still gets the new state, so it doesn't ask again
		$this->assertEquals(FavoritefolderModel::getState(), $result['newState']);
		$this->assertFalse($result['hasMoreChanges']);

		self::actAs(self::$owner->id);
		$result = (new Favoritefolder())->changes(['sinceState' => $since])->getArray();
		$this->assertContains((int) $this->favorite->id, array_map('intval', $result['changed']), var_export($result, true));
		$this->assertContains((int) $destroyed->id, array_map('intval', $result['removed']), var_export($result, true));
		$this->assertNotContains((int) $destroyed->id, array_map('intval', $result['changed']), var_export($result, true));
	}

	public function testDeleteKeepsOwnersOfDeletionsStillInTheChangeLog(): void
	{
		$db = go()->getDbConnection();
		$destroyed = new FavoritefolderModel();
		$destroyed->userId = self::$owner->id;
		$destroyed->account_id = 1;
		$destroyed->mailbox = 'Trash';
		$destroyed->name = 'Trash';
		$this->assertTrue($destroyed->save(), $destroyed->getValidationErrorsAsString());
		EntityType::push();
		$this->assertTrue(FavoritefolderModel::delete(['id' => $destroyed->id]));
		EntityType::push();

		// both owners are older than the change log retention, but only the first one still has its changes in the log
		$old = (new \DateTime())->modify('-' . (go()->getSettings()->syncChangesMaxAge + 1) . ' days');
		$db->update('em_folders_favorites_destroyed', ['destroyedAt' => $old], ['id' => $destroyed->id])->execute();
		$orphanId = 4000000000;
		$db->insert('em_folders_favorites_destroyed', ['id' => $orphanId, 'userId' => self::$owner->id, 'destroyedAt' => $old])->execute();

		// deleting another favorite prunes the owners
		$this->assertTrue(FavoritefolderModel::delete(['id' => $this->favorite->id]));
		EntityType::push();

		$ids = array_map('intval', array_column((new \go\core\db\Query())->select('id')->from('em_folders_favorites_destroyed')
			->where('id', 'IN', [$destroyed->id, $orphanId])->all(), 'id'));
		$this->assertContains((int) $destroyed->id, $ids);
		$this->assertNotContains($orphanId, $ids);
	}
}
