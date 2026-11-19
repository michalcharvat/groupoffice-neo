<?php
namespace go\core\controller;

use go\core\auth\TemporaryState;
use go\core\exception\Forbidden;
use go\core\model\Acl as AclModel;
use go\core\model\Group;
use go\core\model\User as UserModel;
use go\modules\community\addressbook\model\AddressBook;
use PHPUnit\Framework\TestCase;

/**
 * Acl/overview: the permissions overview of System settings → Users
 */
class AclTest extends TestCase
{
	private static $authState;
	private static ?UserModel $user = null;
	private static ?Group $group = null;

	public static function setUpBeforeClass(): void
	{
		self::$authState = go()->getAuthState();

		try {
			$name = uniqid('acloverview');
			$user = new UserModel();
			$user->setValues([
				'username' => $name,
				'displayName' => $name,
				'email' => $name . '@example.com',
				'password' => 'Pa55word!!xyz'
			]);
			if (!$user->save()) {
				throw new \Exception(var_export($user->getValidationErrors(), true));
			}
			self::$user = $user;

			// a group with read access to two items with id 1 of different types
			$group = new Group();
			$group->name = uniqid('acloverview');
			if (!$group->save()) {
				throw new \Exception(var_export($group->getValidationErrors(), true));
			}
			self::$group = $group;

			$aclIds = go()->getDbConnection()
				->selectSingleValue('a.id')
				->from('core_acl', 'a')
				->join('core_entity', 'e', 'e.id = a.entityTypeId')
				->where('a.entityId', '=', 1)
				->andWhere('e.name', 'IN', ['Group', 'AddressBook'])
				->all();
			foreach ($aclIds as $aclId) {
				go()->getDbConnection()->insert('core_acl_group', [
					'aclId' => $aclId,
					'groupId' => $group->id,
					'level' => AclModel::LEVEL_READ
				])->execute();
			}
		} catch (\Throwable $e) {
			// PHPUnit skips tearDownAfterClass() when this fails
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		go()->setAuthState(self::$authState);
		if (self::$user) {
			UserModel::delete(['id' => self::$user->id]);
		}
		if (self::$group) {
			go()->getDbConnection()->delete('core_acl_group', ['groupId' => self::$group->id])->execute();
			Group::delete(['id' => self::$group->id]);
		}
	}

	protected function tearDown(): void
	{
		go()->setAuthState(self::$authState);
	}

	public function testOverviewIsForAdminsOnly(): void
	{
		go()->setAuthState(new TemporaryState(self::$user->id));

		$this->expectException(Forbidden::class);
		(new Acl())->overview([]);
	}

	/**
	 * Entity ids repeat across types: Group 1 and AddressBook 1 must each get their own name
	 */
	public function testNamesMatchTheirEntityType(): void
	{
		go()->setAuthState(new TemporaryState(UserModel::ID_SUPER_ADMIN));

		$list = (new Acl())->overview(['filter' => ['groupId' => self::$group->id]])['list'];

		$names = [];
		foreach ($list as $row) {
			$names[$row->type . ' ' . $row->entityId] = $row->name;
		}
		$this->assertSame(Group::findById(1)->title(), $names['Group 1'] ?? null);
		$this->assertSame(AddressBook::findById(1)->title(), $names['AddressBook 1'] ?? null);
	}
}
