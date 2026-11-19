<?php
namespace go\modules\community\comments\model;

use go\core\auth\TemporaryState;
use go\core\model\Acl;
use go\core\model\Alert;
use go\core\model\User;
use go\core\orm\exception\SaveException;
use go\modules\community\notes\model\Note;
use go\modules\community\notes\model\NoteBook;
use PHPUnit\Framework\TestCase;

/**
 * "@username" in a comment alerts that user, but only a user who may read the commented item
 */
class CommentTest extends TestCase
{
	private static User $author;
	private static User $reader;
	private static User $outsider;
	private static NoteBook $noteBook;
	private static Note $note;
	private static bool $alertsEnabled;

	public static function setUpBeforeClass(): void
	{
		$authState = go()->getAuthState();
		self::$alertsEnabled = Alert::$enabled;

		try {
			go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));

			self::$author = self::newUser();
			// a dot inside the name: "@first.last"
			self::$reader = self::newUser('mention.');
			self::$outsider = self::newUser();

			self::$noteBook = new NoteBook();
			self::$noteBook->name = uniqid('mentions');
			self::$noteBook->setAcl([
				self::$author->getPersonalGroup()->id => Acl::LEVEL_WRITE,
				self::$reader->getPersonalGroup()->id => Acl::LEVEL_READ
			]);
			if (!self::$noteBook->save()) {
				throw new SaveException(self::$noteBook);
			}

			self::$note = new Note();
			self::$note->noteBookId = self::$noteBook->id;
			self::$note->name = 'Mentions';
			self::$note->content = '<p>Mentions</p>';
			if (!self::$note->save()) {
				throw new SaveException(self::$note);
			}
		} catch (\Throwable $e) {
			self::cleanUp();
			go()->setAuthState($authState);
			throw $e;
		}

		go()->setAuthState($authState);
	}

	public static function tearDownAfterClass(): void
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		self::cleanUp();
		go()->setAuthState($authState);
		Alert::$enabled = self::$alertsEnabled;
	}

	private static function cleanUp(): void
	{
		if (isset(self::$noteBook->id)) {
			NoteBook::delete(['id' => self::$noteBook->id]);
		}

		$ids = array_filter([self::$author->id ?? null, self::$reader->id ?? null, self::$outsider->id ?? null]);
		if ($ids) {
			Alert::delete(['userId' => $ids]);
			User::delete(['id' => $ids]);
		}
	}

	private static function newUser(string $prefix = 'mention'): User
	{
		$name = uniqid($prefix);
		$user = new User();
		$user->setValues([
			'username' => $name,
			'displayName' => $name,
			'email' => $name . '@example.com',
			'password' => 'Pa55word!!xyz'
		]);
		if (!$user->save()) {
			throw new SaveException($user);
		}

		return $user;
	}

	/**
	 * Saves a comment on the note as the author
	 */
	private function comment(string $text): void
	{
		$authState = go()->getAuthState();
		Alert::$enabled = true;

		try {
			go()->setAuthState(new TemporaryState(self::$author->id));

			$comment = new Comment();
			$comment->setEntity(self::$note);
			$comment->text = $text;
			$this->assertTrue($comment->save(), json_encode($comment->getValidationErrors()));
		} finally {
			go()->setAuthState($authState);
		}
	}

	private function mentionAlertCount(int $userId): int
	{
		return (int) Alert::find()->selectSingleValue("count(*)")->where([
			'userId' => $userId,
			'tag' => 'mention',
			'entityId' => self::$note->id,
			'entityTypeId' => Note::entityType()->getId()
		])->single();
	}

	protected function tearDown(): void
	{
		Alert::delete(['userId' => [self::$author->id, self::$reader->id, self::$outsider->id]]);
	}

	public function testReaderIsAlerted(): void
	{
		$this->comment('<p>Hi @' . self::$reader->username . '.&nbsp;Look</p>');

		$this->assertSame(1, $this->mentionAlertCount(self::$reader->id));
	}

	public function testUserWithoutAccessIsNotAlerted(): void
	{
		$this->comment('<p>Hi @' . self::$outsider->username . '</p>');

		$this->assertSame(0, $this->mentionAlertCount(self::$outsider->id));
	}

	public function testUnknownNameAndSelfMentionAlertNobody(): void
	{
		$this->comment('<p>Hi @nosuchuser' . uniqid() . ' and @' . self::$author->username . '</p>');

		$this->assertSame(0, $this->mentionAlertCount(self::$author->id));
	}
}
