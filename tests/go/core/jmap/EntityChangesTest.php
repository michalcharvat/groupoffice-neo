<?php
namespace go\core\jmap;

use Exception;
use go\core\auth\TemporaryState;
use go\core\model\Acl;
use go\core\model\User;
use go\core\orm\EntityType;
use go\modules\community\notes\model\Note;
use go\modules\community\notes\model\NoteBook;
use PHPUnit\Framework\TestCase;

/**
 * X/changes pages with an intermediate state when there are more changes than maxChanges. The client sends that state
 * back to get the next page, so it must be accepted like a state of getState(). Uses notes because a note is an
 * AclItemEntity, so both the entity change log and the ACL change log page.
 */
class EntityChangesTest extends TestCase
{
	private static $authState;
	private static User $user;
	/** @var NoteBook[] 'visible' is shared with the user from the start, 'shared' is shared by the tests */
	private static array $noteBooks = [];

	public static function setUpBeforeClass(): void
	{
		self::$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));

		try {
			$prefix = uniqid('changes');
			self::$user = new User();
			self::$user->setValues([
				'username' => $prefix,
				'displayName' => $prefix,
				'email' => $prefix . '@example.com',
				'password' => 'Pa55word!!xyz'
			]);
			if (!self::$user->save()) {
				throw new Exception(self::$user->getValidationErrorsAsString());
			}

			foreach (['visible', 'shared'] as $name) {
				$noteBook = new NoteBook();
				$noteBook->name = $prefix . $name;
				if ($name == 'visible') {
					$noteBook->setAcl([self::$user->getPersonalGroup()->id => Acl::LEVEL_READ]);
				}
				if (!$noteBook->save()) {
					throw new Exception($noteBook->getValidationErrorsAsString());
				}
				self::$noteBooks[$name] = $noteBook;
			}
		} catch (Exception $e) {
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		if (self::$noteBooks) {
			NoteBook::delete(['id' => array_map(fn($nb) => $nb->id, self::$noteBooks)]);
		}
		if (isset(self::$user->id)) {
			User::delete(['id' => self::$user->id]);
		}
		EntityType::push();
		go()->setAuthState(self::$authState);
	}

	protected function tearDown(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		Note::delete(['noteBookId' => array_map(fn($nb) => $nb->id, self::$noteBooks)]);
		self::$noteBooks['shared']->setAcl([self::$user->getPersonalGroup()->id => null]);
		self::$noteBooks['shared']->save();
		EntityType::push();
	}

	/**
	 * @return int[] ids of the new notes
	 */
	private function createNotes(int $count, string $noteBook = 'shared'): array
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		$ids = [];
		for ($i = 0; $i < $count; $i++) {
			$note = new Note();
			$note->noteBookId = self::$noteBooks[$noteBook]->id;
			$note->name = 'Changes ' . $i;
			$note->content = 'Changes';
			$this->assertTrue($note->save(), $note->getValidationErrorsAsString());
			$ids[] = $note->id;
		}
		EntityType::push();

		return $ids;
	}

	/**
	 * Calls changes page by page like a client
	 *
	 * @return int[] the changed ids of all pages
	 */
	private function changesInPages(string $sinceState, int $maxChanges): array
	{
		$changed = [];
		$pages = 0;
		do {
			$result = Note::getChanges($sinceState, $maxChanges);
			$this->assertLessThanOrEqual($maxChanges, count($result['changed']) + count($result['removed']));
			$this->assertEquals([], $result['removed']);
			$changed = array_merge($changed, array_map('intval', $result['changed']));
			$sinceState = $result['newState'];
			$pages++;
		} while ($result['hasMoreChanges'] && $pages < 10);

		$this->assertFalse($result['hasMoreChanges'], 'changes did not end');
		$this->assertGreaterThan(1, $pages, 'changes were not paged');
		$this->assertEquals(Note::getState(), $result['newState']);

		return $changed;
	}

	public function testEntityChangesNextPage(): void
	{
		// a change before the since state, so its modSeq is in the change log
		$this->createNotes(1);
		$since = Note::getState();
		$ids = $this->createNotes(3);

		$changed = $this->changesInPages($since, 2);

		sort($changed);
		$this->assertEquals($ids, $changed);
	}

	public function testAclChangesNextPage(): void
	{
		$ids = $this->createNotes(3);

		go()->setAuthState(new TemporaryState(self::$user->id));
		$since = Note::getState();

		// sharing the note book shows its notes to the user through the ACL change log
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		$this->share();

		go()->setAuthState(new TemporaryState(self::$user->id));
		$changed = $this->changesInPages($since, 2);

		sort($changed);
		$this->assertEquals($ids, $changed);
	}

	/**
	 * Entity changes that fill the whole page leave no room for the ACL changes. The next page must still go on
	 * instead of returning the same page again.
	 */
	public function testEntityChangesFillThePageBeforeAclChanges(): void
	{
		$visible = $this->createNotes(2, 'visible');
		$shared = $this->createNotes(2);

		go()->setAuthState(new TemporaryState(self::$user->id));
		$since = Note::getState();

		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		foreach (Note::find()->where('id', 'in', $visible) as $note) {
			$note->name = 'Changed';
			$this->assertTrue($note->save(), $note->getValidationErrorsAsString());
		}
		EntityType::push();
		$this->share();

		go()->setAuthState(new TemporaryState(self::$user->id));
		$changed = $this->changesInPages($since, 2);

		sort($changed);
		$ids = array_merge($visible, $shared);
		sort($ids);
		$this->assertEquals($ids, $changed);
	}

	/**
	 * A note that is both changed and in a newly shared note book is sent once.
	 */
	public function testChangedNoteInSharedNoteBookIsSentOnce(): void
	{
		$ids = $this->createNotes(3);

		go()->setAuthState(new TemporaryState(self::$user->id));
		$since = Note::getState();

		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		$note = Note::findById($ids[0]);
		$note->name = 'Changed';
		$this->assertTrue($note->save(), $note->getValidationErrorsAsString());
		EntityType::push();
		$this->share();

		go()->setAuthState(new TemporaryState(self::$user->id));
		$changed = $this->changesInPages($since, 2);

		sort($changed);
		$this->assertEquals($ids, $changed);
	}

	private function share(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		self::$noteBooks['shared']->setAcl([self::$user->getPersonalGroup()->id => Acl::LEVEL_READ]);
		$this->assertTrue(self::$noteBooks['shared']->save(), self::$noteBooks['shared']->getValidationErrorsAsString());
		EntityType::push();
	}
}
