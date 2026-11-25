<?php
namespace go\core\webclient;

use GO\Base\Model\State as OldState;
use go\core\auth\TemporaryState;
use go\core\controller\Webclient as WebclientController;
use go\core\jmap\exception\InvalidArguments;
use go\core\model\User;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The user's last open modules on the server (core/Webclient/saveOpenModules), shared with the
 * classic client's Ext state 'open-modules'
 */
class OpenModulesTest extends TestCase
{
	private static array $userIds = [];

	private $authState;

	public static function setUpBeforeClass(): void
	{
		try {
			foreach ([1, 2] as $i) {
				$name = uniqid('openmod' . $i);
				$user = new User();
				$user->setValues([
					'username' => $name,
					'displayName' => $name,
					'email' => $name . '@example.com',
					'password' => 'Pa55word!!xyz'
				]);
				if (!$user->save()) {
					throw new \RuntimeException(var_export($user->getValidationErrors(), true));
				}
				self::$userIds[] = $user->id;
			}
		} catch (\Throwable $e) {
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		if (self::$userIds) {
			go()->getDbConnection()->delete('go_state', ['user_id' => self::$userIds])->execute();
			User::delete(['id' => self::$userIds]);
		}
		self::$userIds = [];
	}

	protected function setUp(): void
	{
		$this->authState = go()->getAuthState();
		go()->getDbConnection()->delete('go_state', ['user_id' => self::$userIds])->execute();
	}

	protected function tearDown(): void
	{
		go()->setAuthState($this->authState);
	}

	private function actAs(int $userId): void
	{
		go()->setAuthState(new TemporaryState($userId));
	}

	private static function stored(int $userId): ?string
	{
		return OldState::model()->getFullClientState($userId)[OpenModules::STATE_NAME] ?? null;
	}

	public function testEncodesLikeExtState(): void
	{
		// Ext.state.Provider.encodeValue(['notes', 'email']) in the classic client
		$this->assertSame('a%3As%253Anotes%5Es%253Aemail', OpenModules::encode(['notes', 'email']));
		$this->assertSame('a%3A', OpenModules::encode([]));
		// bookmarks as modules; escape() leaves '-' as is
		$this->assertSame('a%3As%253Abookmarks-42', OpenModules::encode(OpenModules::validate(['bookmarks-42'])));
	}

	public function testSavesOnlyTheCurrentUsersState(): void
	{
		[$a, $b] = self::$userIds;

		$this->actAs($a);
		$result = (new WebclientController())->saveOpenModules(['modules' => ['notes', 'email', 'notes'], 'userId' => $b]);

		$this->assertSame(['notes', 'email'], $result['modules']);
		$this->assertSame('a%3As%253Anotes%5Es%253Aemail', self::stored($a));
		// 'userId' is ignored: another user's state is never written
		$this->assertNull(self::stored($b));

		$this->actAs($b);
		(new WebclientController())->saveOpenModules(['modules' => ['calendar']]);
		$this->assertSame(OpenModules::encode(['calendar']), self::stored($b));
		$this->assertSame('a%3As%253Anotes%5Es%253Aemail', self::stored($a));

		// replaced, not added
		(new WebclientController())->saveOpenModules(['modules' => []]);
		$this->assertSame('a%3A', self::stored($b));
	}

	public static function invalidProvider(): array
	{
		return [
			'missing' => [null],
			'string' => ['notes'],
			'map' => [['a' => 'notes']],
			'not a string' => [[1]],
			'nested' => [[['notes']]],
			'separator' => [['notes^email']],
			'escaped' => [['s%3Anotes']],
			'empty name' => [['']],
			'trailing newline' => [["notes\n"]],
			'too long name' => [[str_repeat('a', 101)]],
			'too many' => [array_fill(0, OpenModules::MAX_MODULES + 1, 'notes')],
		];
	}

	#[DataProvider('invalidProvider')]
	public function testRejectsInvalidModules(mixed $modules): void
	{
		$this->actAs(self::$userIds[0]);

		try {
			(new WebclientController())->saveOpenModules(['modules' => $modules]);
			$this->fail('InvalidArguments expected');
		} catch (InvalidArguments $e) {
			$this->assertNull(self::stored(self::$userIds[0]));
		}
	}
}
