<?php
namespace go\core\acl\model;

use go\core\auth\TemporaryState;
use go\core\jmap\EntityController;
use go\core\model\Acl;
use go\core\model\User;
use go\modules\community\addressbook\controller\Contact as ContactController;
use go\modules\community\addressbook\model\AddressBook;
use go\modules\community\addressbook\model\Contact;
use go\modules\community\notes\controller\Note as NoteController;
use go\modules\community\notes\model\Note;
use go\modules\community\notes\model\NoteBook;
use go\modules\community\tasks\controller\Task as TaskController;
use go\modules\community\tasks\model\Task;
use go\modules\community\tasks\model\TaskList;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * X/get with "properties" that leave out the key of the ACL entity (like addressBookId of a contact) must still
 * check the permission on that entity, and return the items the user may read.
 */
class AclItemEntityGetTest extends TestCase
{
	private static $authState;
	private static ?User $user = null;

	/** @var array<string, array{containers: AclOwnerEntity[], readable: string, hidden: string}> */
	private static array $fixtures = [];

	public static function setUpBeforeClass(): void
	{
		self::$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));

		try {
			$prefix = uniqid('aclget');
			self::$user = new User();
			self::$user->setValues([
				'username' => $prefix,
				'displayName' => $prefix,
				'email' => $prefix . '@example.com',
				'password' => 'Pa55word!!xyz'
			]);
			if (!self::$user->save()) {
				throw new \Exception(self::$user->getValidationErrorsAsString());
			}
			$groupId = self::$user->getPersonalGroup()->id;

			self::createFixture('contact', $groupId, $prefix, AddressBook::class, function (int $containerId) {
				$contact = new Contact();
				$contact->addressBookId = $containerId;
				$contact->firstName = 'Test';
				$contact->lastName = 'Contact';
				return $contact;
			});

			self::createFixture('task', $groupId, $prefix, TaskList::class, function (int $containerId) {
				$task = new Task();
				$task->tasklistId = $containerId;
				$task->title = 'Test task';
				return $task;
			});

			self::createFixture('note', $groupId, $prefix, NoteBook::class, function (int $containerId) {
				$note = new Note();
				$note->noteBookId = $containerId;
				$note->name = 'Test note';
				$note->content = 'Test';
				return $note;
			});
		} catch (\Throwable $e) {
			self::tearDownAfterClass();
			throw $e;
		}
	}

	/**
	 * Create a container the user may read with one item and a container the user can't access with one item.
	 *
	 * @param class-string<AclOwnerEntity> $containerCls
	 */
	private static function createFixture(string $type, int $groupId, string $prefix, string $containerCls, callable $newItem): void
	{
		self::$fixtures[$type] = ['containers' => []];
		foreach (['readable' => Acl::LEVEL_READ, 'hidden' => null] as $name => $level) {
			$container = new $containerCls();
			$container->name = $prefix . $type . $name;
			$container->setAcl($level ? [$groupId => $level] : []);
			if (!$container->save()) {
				throw new \Exception($container->getValidationErrorsAsString());
			}
			self::$fixtures[$type]['containers'][] = $container;

			$item = $newItem($container->id);
			if (!$item->save()) {
				throw new \Exception($item->getValidationErrorsAsString());
			}
			self::$fixtures[$type][$name] = (string) $item->id;
		}
	}

	public static function tearDownAfterClass(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		try {
			foreach (self::$fixtures as $fixture) {
				foreach ($fixture['containers'] as $container) {
					$container::delete(['id' => $container->id]);
				}
			}
			self::$fixtures = [];
			if (self::$user && self::$user->id) {
				User::delete(['id' => self::$user->id]);
			}
			self::$user = null;
		} finally {
			go()->setAuthState(self::$authState);
		}
	}

	public static function types(): array
	{
		return [
			'contact without addressBookId' => ['contact', ContactController::class, ['id', 'name']],
			'contact with only the id' => ['contact', ContactController::class, ['id']],
			'task without tasklistId' => ['task', TaskController::class, ['id', 'title']],
			'note without noteBookId' => ['note', NoteController::class, ['id', 'name']],
		];
	}

	/**
	 * @param class-string<EntityController> $controllerCls
	 */
	#[DataProvider('types')]
	public function testGetWithoutAclKeyProperty(string $type, string $controllerCls, array $properties): void
	{
		$readable = self::$fixtures[$type]['readable'];
		$hidden = self::$fixtures[$type]['hidden'];

		go()->setAuthState(new TemporaryState(self::$user->id));
		$result = (new $controllerCls())->get(['ids' => [$readable, $hidden], 'properties' => $properties])->getArray();

		$ids = array_map(fn($item) => (string) $item['id'], $result['list']);
		$this->assertSame([$readable], $ids);
		$this->assertSame([$hidden], array_map('strval', $result['notFound']));

		// Only the requested properties are returned
		$this->assertEqualsCanonicalizing($properties, array_keys($result['list'][0]));
	}
}
