<?php

namespace go\core\model;

use go\core\auth\TemporaryState;
use go\core\controller\Link as LinkController;
use go\core\db\Query;
use go\modules\community\notes\model\Note;
use go\modules\community\notes\model\NoteBook;
use PHPUnit\Framework\TestCase;

/**
 * A link whose target has no core_search row (search cache not built yet, failed rebuild) must not disappear for
 * admins, and must not leak to users: the target's ACL is only known through that row in Link/query.
 */
class LinkTest extends TestCase
{
	private static NoteBook $sourceBook;
	private static NoteBook $targetBook;
	/** Reads both note books */
	private static User $reader;
	/** Reads only the note book of the note the links come from */
	private static User $sourceReader;
	/** Reads the source note book, but has a level below read on the target note book */
	private static User $lowLevelUser;
	private static User $outsider;
	private static $authState;

	private Note $from;
	private Note $to;

	public static function setUpBeforeClass(): void
	{
		self::$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));

		try {
			self::$reader = self::createUser('linkreader');
			self::$sourceReader = self::createUser('linksource');
			self::$lowLevelUser = self::createUser('linklow');
			self::$outsider = self::createUser('linkoutsider');

			self::$sourceBook = self::createNoteBook([
				self::$reader->getPersonalGroup()->id => Acl::LEVEL_READ,
				self::$sourceReader->getPersonalGroup()->id => Acl::LEVEL_READ,
				self::$lowLevelUser->getPersonalGroup()->id => Acl::LEVEL_READ
			]);
			self::$targetBook = self::createNoteBook([
				self::$reader->getPersonalGroup()->id => Acl::LEVEL_READ,
				// Below read, like free/busy access to a calendar
				self::$lowLevelUser->getPersonalGroup()->id => 5
			]);
		} catch (\Throwable $e) {
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		foreach ([self::$sourceBook ?? null, self::$targetBook ?? null] as $noteBook) {
			if (isset($noteBook->id)) {
				NoteBook::delete(['id' => $noteBook->id]);
			}
		}
		foreach ([self::$reader ?? null, self::$sourceReader ?? null, self::$lowLevelUser ?? null, self::$outsider ?? null] as $user) {
			if (isset($user->id)) {
				User::delete(['id' => $user->id]);
			}
		}
		go()->setAuthState(self::$authState);
	}

	private static function createNoteBook(array $acl): NoteBook
	{
		$noteBook = new NoteBook();
		$noteBook->name = "Link test " . uniqid();
		$noteBook->setAcl($acl);
		if (!$noteBook->save()) {
			throw new \Exception($noteBook->getValidationErrorsAsString());
		}
		return $noteBook;
	}

	private static function createUser(string $prefix): User
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
			throw new \Exception($user->getValidationErrorsAsString());
		}
		return $user;
	}

	protected function setUp(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		$this->from = $this->createNote(self::$sourceBook, "Link from " . uniqid());
		$this->to = $this->createNote(self::$targetBook, "Link to " . uniqid());
		$this->assertNotFalse(Link::create($this->from, $this->to));
	}

	protected function tearDown(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		Note::delete(['id' => [$this->from->id, $this->to->id]]);
		go()->getDbConnection()->delete('core_link', [
			'fromEntityTypeId' => Note::entityType()->getId(),
			'fromId' => $this->from->id
		])->execute();
	}

	private function createNote(NoteBook $noteBook, string $name): Note
	{
		$note = new Note();
		$note->noteBookId = $noteBook->id;
		$note->name = $name;
		$note->content = "test";
		$this->assertTrue($note->save(), $note->getValidationErrorsAsString());
		return $note;
	}

	private function deleteSearchRow(): void
	{
		go()->getDbConnection()->delete('core_search', [
			'entityTypeId' => Note::entityType()->getId(),
			'entityId' => $this->to->id
		])->execute();
	}

	/**
	 * The id of the link from $this->from to $this->to, read without ACL
	 */
	private function linkId(?int $toId = null): int
	{
		return (int) (new Query)
			->selectSingleValue('id')
			->from('core_link')
			->where([
				'fromEntityTypeId' => Note::entityType()->getId(),
				'fromId' => $this->from->id,
				'toEntityTypeId' => Note::entityType()->getId(),
				'toId' => $toId ?? $this->to->id
			])
			->single();
	}

	/**
	 * Link/query of the links panel of $this->from, as the given user
	 */
	private function queryLinkIds(int $userId): array
	{
		go()->setAuthState(new TemporaryState($userId));
		$response = (new LinkController())->query(['filter' => ['entityId' => $this->from->id, 'entity' => 'Note']]);
		return array_map('intval', $response->getArray()['ids']);
	}

	private function findLink(int $userId, ?int $linkId = null): Link
	{
		go()->setAuthState(new TemporaryState($userId));
		$link = Link::findById($linkId ?? $this->linkId());
		$this->assertNotNull($link);
		return $link;
	}

	public function testLinkWithoutSearchRowIsListedForAdmin(): void
	{
		$linkId = $this->linkId();
		$this->deleteSearchRow();

		$this->assertContains($linkId, $this->queryLinkIds(User::ID_SUPER_ADMIN));

		$list = (new LinkController())->get(['ids' => [$linkId]])->getArray()['list'];
		$this->assertCount(1, $list);
		$this->assertSame('Note', $list[0]['toEntity']);
		$this->assertSame((int) $this->to->id, (int) $list[0]['toId']);
		$this->assertNull($list[0]['toSearchId']);
	}

	public function testLinkWithoutSearchRowIsHiddenFromUsers(): void
	{
		$linkId = $this->linkId();

		// The guard below must be the missing search row, not a missing permission
		$this->assertContains($linkId, $this->queryLinkIds(self::$reader->id));
		$this->assertNotContains($linkId, $this->queryLinkIds(self::$sourceReader->id));

		$this->deleteSearchRow();

		$this->assertNotContains($linkId, $this->queryLinkIds(self::$reader->id));
		$this->assertNotContains($linkId, $this->queryLinkIds(self::$sourceReader->id));
		$this->assertNotContains($linkId, $this->queryLinkIds(self::$outsider->id));
	}

	public function testPermissionWithoutSearchRowComesFromTarget(): void
	{
		$this->deleteSearchRow();

		$this->assertSame(Acl::LEVEL_DELETE, $this->findLink(User::ID_SUPER_ADMIN)->getPermissionLevel());
		// Read access on the target is enough to delete the link, like with a search row
		$this->assertSame(Acl::LEVEL_DELETE, $this->findLink(self::$reader->id)->getPermissionLevel());
		// Access to the note the link comes from is not enough
		$this->assertSame(0, $this->findLink(self::$sourceReader->id)->getPermissionLevel());
		$this->assertSame(0, $this->findLink(self::$lowLevelUser->id)->getPermissionLevel());
		$this->assertSame(0, $this->findLink(self::$outsider->id)->getPermissionLevel());
	}

	public function testLevelBelowReadGivesNoAccessWithSearchRow(): void
	{
		$this->assertSame(Acl::LEVEL_DELETE, $this->findLink(self::$reader->id)->getPermissionLevel());
		$this->assertSame(0, $this->findLink(self::$lowLevelUser->id)->getPermissionLevel());
	}

	public function testLinkToMissingTargetIsOnlyForAdmins(): void
	{
		// A target that is gone and has no search row: there is no ACL to check
		$missingId = 2147483000;
		go()->getDbConnection()->insert('core_link', [
			'fromEntityTypeId' => Note::entityType()->getId(),
			'fromId' => $this->from->id,
			'toEntityTypeId' => Note::entityType()->getId(),
			'toId' => $missingId,
			'createdAt' => new \DateTime()
		])->execute();
		$linkId = $this->linkId($missingId);
		$this->assertGreaterThan(0, $linkId);

		$this->assertSame(Acl::LEVEL_DELETE, $this->findLink(User::ID_SUPER_ADMIN, $linkId)->getPermissionLevel());
		$this->assertSame(0, $this->findLink(self::$reader->id, $linkId)->getPermissionLevel());
		$this->assertContains($linkId, $this->queryLinkIds(User::ID_SUPER_ADMIN));
		$this->assertNotContains($linkId, $this->queryLinkIds(self::$reader->id));
	}

	public function testAdminCanDeleteLinkWithoutSearchRow(): void
	{
		$linkId = $this->linkId();
		$this->deleteSearchRow();

		$result = (new LinkController())->set(['destroy' => [$linkId]])->getArray();
		$this->assertSame([$linkId], array_map('intval', $result['destroyed'] ?? []), json_encode($result));
		$this->assertSame(0, $this->linkId());

		// The deletion is in the change log, so clients that have the link drop it
		$destroyed = (new Query)
			->selectSingleValue('destroyed')
			->from('core_change')
			->where(['entityTypeId' => Link::entityType()->getId(), 'entityId' => $linkId])
			->orderBy(['modSeq' => 'DESC'])
			->single();
		$this->assertSame(1, (int) $destroyed);
	}
}
