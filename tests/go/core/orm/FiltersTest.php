<?php

namespace go\core\orm;

use go\core\db\Criteria;
use go\core\db\Query as DbQuery;
use go\core\jmap\exception\InvalidArguments;
use go\core\model\Link;
use go\core\model\Search;
use go\core\model\User;
use go\core\orm\exception\SaveException;
use go\core\util\DateTime;
use go\modules\community\comments\model\Comment;
use go\modules\community\notes\model\Note;
use go\modules\community\notes\model\NoteBook;
use go\modules\community\test\model\A;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class FiltersTest extends TestCase
{
	private NoteBook $noteBook;

	/**
	 * @var Note[]
	 */
	private array $notes = [];

	protected function setUp(): void
	{
		$this->noteBook = new NoteBook();
		$this->noteBook->name = "Filters test " . uniqid();
		if (!$this->noteBook->save()) {
			throw new SaveException($this->noteBook);
		}
	}

	protected function tearDown(): void
	{
		$ids = array_map(fn(Note $n) => $n->id, $this->notes);
		if (!empty($ids)) {
			$typeId = Note::entityType()->getId();
			go()->getDbConnection()->delete('core_link', (new DbQuery())
				->where('fromEntityTypeId', '=', $typeId)->andWhere('fromId', 'IN', $ids)
				->orWhere((new Criteria())->where('toEntityTypeId', '=', $typeId)->andWhere('toId', 'IN', $ids))
			)->execute();

			Comment::delete(['entityTypeId' => $typeId, 'entityId' => $ids]);
			Note::delete(['id' => $ids]);
		}

		NoteBook::delete(['id' => $this->noteBook->id]);
	}

	private function createNote(string $name): Note
	{
		$note = new Note();
		$note->noteBookId = $this->noteBook->id;
		$note->name = $name;
		$note->content = "test";
		if (!$note->save()) {
			throw new SaveException($note);
		}
		$this->notes[] = $note;
		return $note;
	}

	/**
	 * @return int[]
	 */
	private function findNoteIds(array $filter): array
	{
		// Wrapped so that it also restricts filters with an operator
		$filter = ['operator' => 'AND', 'conditions' => [['noteBookId' => $this->noteBook->id], $filter]];
		return array_map('intval', Note::find()->selectSingleValue('n.id')->filter($filter)->orderBy(['n.id' => 'ASC'])->all());
	}

	public static function createdByProvider(): array
	{
		return [
			'id' => [fn(User $u) => [$u->id], true],
			'id as string' => [fn(User $u) => [(string) $u->id], true],
			'me' => [fn(User $u) => ["{{me}}"], true],
			'display name' => [fn(User $u) => [$u->displayName], true],
			'unknown id' => [fn(User $u) => [PHP_INT_MAX], false],
			'unknown name' => [fn(User $u) => ["No such user " . uniqid()], false],
			// The first value used to decide whether all values were ID's or names
			'unknown name then id' => [fn(User $u) => ["No such user " . uniqid(), $u->id], true],
			'unknown id then name' => [fn(User $u) => [PHP_INT_MAX, $u->displayName], true],
		];
	}

	#[DataProvider('createdByProvider')]
	public function testCreatedByAndModifiedBy(callable $value, bool $expectMatch): void
	{
		$note = $this->createNote("createdBy");
		$user = User::findById(go()->getUserId(), ['id', 'displayName']);

		foreach (['createdBy', 'modifiedBy'] as $filterName) {
			$expected = $expectMatch ? [$note->id] : [];
			$this->assertEquals($expected, $this->findNoteIds([$filterName => $value($user)]), $filterName);
		}
	}

	public function testLinkFilter(): void
	{
		$a = $this->createNote("a");
		$b = $this->createNote("b");
		$c = $this->createNote("c");
		$d = $this->createNote("d");

		Link::create($a, $b);
		Link::create($c, $b);
		Link::create($a, $d);

		$this->assertEquals([$b->id, $d->id], $this->findNoteIds(['link' => ['entity' => 'Note', 'id' => $a->id]]));

		// Two link filters must each use their own join alias
		$this->assertEquals([$b->id], $this->findNoteIds([
			'operator' => 'AND',
			'conditions' => [
				['link' => ['entity' => 'Note', 'id' => $a->id]],
				['link' => ['entity' => 'Note', 'id' => $c->id]]
			]
		]));
	}

	public function testTwoTextFiltersMustAllMatch(): void
	{
		$x = "alpha" . uniqid();
		$y = "beta" . uniqid();
		$both = $this->createNote("$x $y");
		$onlyX = $this->createNote($x);
		$onlyY = $this->createNote($y);

		// One phrase with two words
		$this->assertEquals([$both->id], $this->findNoteIds(['text' => "$x $y"]));

		// Two text filters must each use their own search word join
		$this->assertEquals([$both->id], $this->findNoteIds([
			'operator' => 'AND',
			'conditions' => [['text' => $x], ['text' => $y]]
		]));

		// An array of search terms must all match
		$this->assertEquals([$both->id], $this->findNoteIds(['text' => [$x, $y]]));

		$this->assertEquals([$both->id, $onlyX->id, $onlyY->id], $this->findNoteIds([
			'operator' => 'OR',
			'conditions' => [['text' => $x], ['text' => $y]]
		]));

		$this->assertEquals([$onlyX->id], $this->findNoteIds([
			'operator' => 'AND',
			'conditions' => [['text' => $x], ['operator' => 'NOT', 'conditions' => [['text' => $y]]]]
		]));

		// The search cache entity has its own text filter
		$entityIds = array_map('intval', Search::find()->selectSingleValue('search.entityId')->filter([
			'operator' => 'AND',
			'conditions' => [['text' => $x], ['text' => $y]]
		])->all());
		$this->assertEquals([$both->id], $entityIds);
	}

	/**
	 * Search/query and Link/query drop the GROUP BY of the search word joins for speed. A text filter under an OR
	 * or NOT must still return every id once, and the total must count each item once.
	 */
	public function testSearchAndLinkQueryWithTextFiltersInOrReturnUniqueIds(): void
	{
		$x = "alpha" . uniqid();
		$y = "beta" . uniqid();
		$both = $this->createNote("$x $y");
		// Two words start with $x, so a NOT without the GROUP BY returns it twice
		$onlyX = $this->createNote("{$x}one {$x}two");
		$onlyY = $this->createNote("$y other words");
		$from = $this->createNote("from");
		foreach ([$both, $onlyX, $onlyY] as $note) {
			Link::create($from, $note);
		}

		$searchIds = fn(Note ...$notes) => array_map(
			fn(Note $n) => (string) Search::find()->selectSingleValue('search.id')
				->where(['entityTypeId' => Note::entityType()->getId(), 'entityId' => $n->id])->single(),
			$notes
		);

		$cases = [
			'OR' => [
				['operator' => 'OR', 'conditions' => [['text' => $x], ['text' => $y]]],
				[$both, $onlyX, $onlyY]
			],
			'text OR other filter' => [
				['operator' => 'OR', 'conditions' => [['text' => $x], ['entityId' => $onlyY->id]]],
				[$both, $onlyX, $onlyY]
			],
			'NOT' => [
				['operator' => 'AND', 'conditions' => [['text' => $x], ['operator' => 'NOT', 'conditions' => [['text' => $y]]]]],
				[$onlyX]
			],
			'AND' => [
				['operator' => 'AND', 'conditions' => [['text' => $x], ['text' => $y]]],
				[$both]
			],
		];

		$searchController = new \go\core\controller\Search();
		$linkController = new \go\core\controller\Link();
		foreach ($cases as $name => [$filter, $expectedNotes]) {
			$filter = ['operator' => 'AND', 'conditions' => [['entities' => ['Note']], $filter]];
			$response = $searchController->query(['filter' => $filter, 'calculateTotal' => true]);
			$ids = $response['ids'];
			$expected = $searchIds(...$expectedNotes);
			sort($ids);
			sort($expected);
			$this->assertSame($expected, $ids, "Search/query $name");
			$this->assertSame(count($expected), $response['total'], "Search/query $name");

			if ($name === 'text OR other filter') {
				continue; // entityId means the link source in Link/query
			}
			$linkFilter = ['operator' => 'AND', 'conditions' => [['entity' => 'Note', 'entityId' => $from->id], $filter['conditions'][1]]];
			$response = $linkController->query(['filter' => $linkFilter, 'calculateTotal' => true]);
			$this->assertCount(count($expectedNotes), array_unique($response['ids']), "Link/query $name");
			$this->assertSame(count($expectedNotes), count($response['ids']), "Link/query $name");
			$this->assertSame(count($expectedNotes), $response['total'], "Link/query $name");
		}
	}

	/**
	 * @return string[] The core_search ids of the notes
	 */
	private function searchIds(Note ...$notes): array
	{
		$ids = array_map(
			fn(Note $n) => (string) Search::find()->selectSingleValue('search.id')
				->where(['entityTypeId' => Note::entityType()->getId(), 'entityId' => $n->id])->single(),
			$notes
		);
		sort($ids);
		return $ids;
	}

	/**
	 * @return string[] The ids of the links from $from to the notes
	 */
	private function linkIds(Note $from, Note ...$notes): array
	{
		if (empty($notes)) {
			return [];
		}
		$ids = array_map('strval', Link::find()->selectSingleValue('l.id')->where([
			'fromEntityTypeId' => Note::entityType()->getId(),
			'fromId' => $from->id,
			'toEntityTypeId' => Note::entityType()->getId(),
			'toId' => array_map(fn(Note $n) => $n->id, $notes)
		])->all());
		sort($ids);
		return $ids;
	}

	/**
	 * Asserts the ids and the total of Search/query and Link/query for a filter on notes
	 *
	 * @param array $filter The filter without the restriction to notes or links
	 * @param Note $from The note that links to every note of the test
	 * @param Note[] $expectedNotes
	 * @param bool $link False when the filter means something else in Link/query (entityId is the link source there)
	 */
	private function assertSearchAndLinkQuery(array $filter, Note $from, array $expectedNotes, string $message, bool $link = true): void
	{
		$searchFilter = ['operator' => 'AND', 'conditions' => [['entities' => ['Note']], $filter]];
		$response = (new \go\core\controller\Search())->query(['filter' => $searchFilter, 'calculateTotal' => true]);
		$ids = $response['ids'];
		sort($ids);
		$expected = $this->searchIds(...$expectedNotes);
		$this->assertSame($expected, $ids, "Search/query $message");
		$this->assertSame(count($expected), $response['total'], "Search/query $message");

		if (!$link) {
			return;
		}
		$linkFilter = ['operator' => 'AND', 'conditions' => [['entity' => 'Note', 'entityId' => $from->id], $filter]];
		$response = (new \go\core\controller\Link())->query(['filter' => $linkFilter, 'calculateTotal' => true]);
		$ids = $response['ids'];
		sort($ids);
		$this->assertSame($this->linkIds($from, ...$expectedNotes), $ids, "Link/query $message");
		$this->assertSame(count($expectedNotes), $response['total'], "Link/query $message");
	}

	/**
	 * One text filter whose word is the start of two words of an item must return that item once
	 *
	 * Known limitation: Search/query drops the GROUP BY of the search word joins for speed, so its plain text
	 * filter (as the global search sends it) still returns such an item twice and counts it twice in the total.
	 * Its SQL stays as it is on purpose; the case is rare and dedupe would slow every global search.
	 */
	public function testTextFilterMatchingTwoWordsOfOneItemReturnsItOnce(): void
	{
		$x = "alpha" . uniqid();
		$twoWords = $this->createNote("{$x}one {$x}two");
		$other = $this->createNote("$x other");
		$from = $this->createNote("from");
		Link::create($from, $twoWords);
		Link::create($from, $other);

		$this->assertEquals([$twoWords->id, $other->id], $this->findNoteIds(['text' => $x]));
		$this->assertEquals([$twoWords->id], $this->findNoteIds(['text' => "$x {$x}one"]));

		$entityIds = array_map('intval', Search::find()->selectSingleValue('search.entityId')
			->filter(['text' => $x])->orderBy(['search.entityId' => 'ASC'])->all());
		$this->assertEquals([$twoWords->id, $other->id], $entityIds);

		// Link/query is DISTINCT, so the total must count each link once too
		$response = (new \go\core\controller\Link())->query([
			'filter' => ['entity' => 'Note', 'entityId' => $from->id, 'text' => $x],
			'calculateTotal' => true
		]);
		$ids = $response['ids'];
		sort($ids);
		$this->assertSame($this->linkIds($from, $twoWords, $other), $ids);
		$this->assertSame(2, $response['total']);
	}

	/**
	 * The first text filter of a query used to own the search word joins. Under a NOT it then excluded only the
	 * word rows that matched, so an item that also has other words was still found.
	 */
	public function testNotOnFirstTextFilter(): void
	{
		$x = "alpha" . uniqid();
		$y = "beta" . uniqid();
		$both = $this->createNote("$x $y");
		$onlyX = $this->createNote($x);
		$onlyY = $this->createNote("$y other");
		$from = $this->createNote("from");
		foreach ([$both, $onlyX, $onlyY] as $note) {
			Link::create($from, $note);
		}

		$this->assertEquals([$onlyX->id], $this->findNoteIds([
			'operator' => 'AND',
			'conditions' => [['operator' => 'NOT', 'conditions' => [['text' => $y]]], ['text' => $x]]
		]));

		// Only a NOT: every note of the book except the ones with $y
		$this->assertEquals([$onlyX->id, $from->id], $this->findNoteIds([
			'operator' => 'NOT', 'conditions' => [['text' => $y]]
		]));

		$this->assertSearchAndLinkQuery([
			'operator' => 'AND',
			'conditions' => [['operator' => 'NOT', 'conditions' => [['text' => $y]]], ['text' => $x]]
		], $from, [$onlyX], "NOT first");
	}

	/**
	 * A text filter in an OR branch must not drop the items that have no search words when another branch matches
	 */
	public function testTextFilterUnderOrKeepsItemsWithoutWords(): void
	{
		$x = "alpha" . uniqid();
		$withX = $this->createNote($x);
		$noWords = $this->createNote("nowords");
		$from = $this->createNote("from");
		Link::create($from, $withX);
		Link::create($from, $noWords);

		$noWordsSearchId = $this->searchIds($noWords)[0];
		go()->getDbConnection()->delete('core_search_word', ['searchId' => $noWordsSearchId])->execute();

		$this->assertEquals([$withX->id, $noWords->id, $from->id], $this->findNoteIds([
			'operator' => 'OR',
			'conditions' => [['text' => $x], ['operator' => 'NOT', 'conditions' => [['text' => $x]]]]
		]));

		$this->assertSearchAndLinkQuery([
			'operator' => 'OR',
			'conditions' => [['text' => $x], ['entityId' => $noWords->id]]
		], $from, [$withX, $noWords], "text OR entityId", false);

		// The link filter joins one row per link of an item, so Search/query must keep its GROUP BY here
		$second = $this->createNote("second");
		Link::create($second, $withX);
		$this->assertSearchAndLinkQuery([
			'operator' => 'OR',
			'conditions' => [['text' => $x], ['link' => ['entity' => 'Note', 'id' => $from->id]]]
		], $from, [$withX, $noWords], "text OR link", false);
	}

	public function testLinkFilterWithNot(): void
	{
		$a = $this->createNote("a");
		$b = $this->createNote("b");
		$c = $this->createNote("c");

		Link::create($a, $b);
		Link::create($c, $b);

		// b is linked to a and c, so it must be excluded even though it also has a link to c
		$this->assertEquals([$a->id, $c->id], $this->findNoteIds([
			'operator' => 'NOT',
			'conditions' => [['link' => ['entity' => 'Note', 'id' => $a->id]]]
		]));
	}

	private function addComment(Note $note, string $text): void
	{
		$comment = new Comment();
		$comment->setEntity($note);
		$comment->text = $text;
		$comment->date = new DateTime();
		if (!$comment->save()) {
			throw new SaveException($comment);
		}
	}

	/**
	 * Creates notes: a with "apple", b without comments, c with "apple" and "pear" and d with "pear"
	 *
	 * @return Note[]
	 */
	private function createCommentedNotes(): array
	{
		$a = $this->createNote("a");
		$b = $this->createNote("b");
		$c = $this->createNote("c");
		$d = $this->createNote("d");

		$this->addComment($a, "apple");
		$this->addComment($c, "apple");
		$this->addComment($c, "pear");
		$this->addComment($d, "pear");

		return [$a, $b, $c, $d];
	}

	public function testCommentFilter(): void
	{
		[$a, $b, $c, $d] = $this->createCommentedNotes();

		$this->assertEquals([$a->id, $c->id], $this->findNoteIds(['comment' => '%apple%']));

		// A note without comments must still match the other condition
		$this->assertEquals([$a->id, $b->id, $c->id], $this->findNoteIds([
			'operator' => 'OR',
			'conditions' => [['comment' => '%apple%'], ['exclude' => [$a->id, $c->id, $d->id]]]
		]));

		// c has a pear comment too but must be excluded because it has an apple comment
		$this->assertEquals([$b->id, $d->id], $this->findNoteIds([
			'operator' => 'NOT',
			'conditions' => [['comment' => '%apple%']]
		]));
	}

	public function testCommentedAtFilter(): void
	{
		[$a, $b, $c, $d] = $this->createCommentedNotes();

		$this->assertEquals([$a->id, $c->id, $d->id], $this->findNoteIds(['commentedAt' => '>2000-01-01']));
		$this->assertEquals([], $this->findNoteIds(['commentedAt' => '<2000-01-01']));

		$this->assertEquals([$a->id, $b->id], $this->findNoteIds([
			'operator' => 'OR',
			'conditions' => [['commentedAt' => '<2000-01-01'], ['exclude' => [$c->id, $d->id]]]
		]));

		$this->assertEquals([$b->id], $this->findNoteIds([
			'operator' => 'NOT',
			'conditions' => [['commentedAt' => '>2000-01-01']]
		]));

		// null finds entities without comments
		$this->assertEquals([$b->id], $this->findNoteIds(['commentedAt' => null]));
		$this->assertEquals([$a->id, $c->id, $d->id], $this->findNoteIds([
			'operator' => 'NOT',
			'conditions' => [['commentedAt' => null]]
		]));
	}

	public function testLinkFilterWithUnknownEntity(): void
	{
		$this->expectException(InvalidArguments::class);
		$this->findNoteIds(['link' => ['entity' => 'NoSuchEntity']]);
	}

	public function testLinkFilterWithInvalidValue(): void
	{
		$this->expectException(InvalidArguments::class);
		$this->findNoteIds(['link' => 'Note']);
	}

	public function testCustomRelationsFilterIsRemoved(): void
	{
		$this->assertFalse(Note::getFilters()->hasFilter('customrelations'));
	}

	public function testAddColumnUsesDateTimeForDatetimeColumns(): void
	{
		$filters = (new Filters(A::class))
			->addColumn('createdAt')
			->addColumn('propA');

		$prop = new \ReflectionProperty(Filters::class, 'filters');
		$defs = $prop->getValue($filters);

		$this->assertEquals('datetime', $defs['createdat']['type']);
		$this->assertEquals('generic', $defs['propa']['type']);
	}

	public function testAddColumnThrowsForUnknownColumn(): void
	{
		$this->expectException(\InvalidArgumentException::class);
		(new Filters(A::class))->addColumn('noSuchColumn');
	}

	public function testDescribeAddsDescriptionAndSchema(): void
	{
		$filters = (new Filters(A::class))
			->add('foo', function () {})
			->describe("Foo id", ['type' => 'integer'])
			->addNumber('bar', function () {}, 5);

		$props = (array) $filters->toJsonSchema()['$defs']['FilterCondition']['properties'];

		$this->assertEquals('integer', $props['foo']['type']);
		$this->assertEquals('Foo id', $props['foo']['description']);
		$this->assertEquals('generic', $props['foo']['x-filterType']);

		$this->assertEquals(['number', 'string'], $props['bar']['type']);
		$this->assertEquals(5, $props['bar']['default']);
		$this->assertStringContainsString('1..10', $props['bar']['description']);
	}

	public function testToJsonSchemaWithoutTypeSyntax(): void
	{
		$filters = (new Filters(A::class))
			->addDate('due', function () {})
			->describe("Due date");

		$with = (array) $filters->toJsonSchema()['$defs']['FilterCondition']['properties'];
		$without = (array) $filters->toJsonSchema(false)['$defs']['FilterCondition']['properties'];

		$this->assertStringContainsString(Filters::getTypeSyntax()['date'], $with['due']['description']);
		$this->assertEquals('Due date', $without['due']['description']);
	}

	public function testDescribeWithoutFilterThrows(): void
	{
		$this->expectException(\LogicException::class);
		(new Filters(A::class))->describe("Nothing");
	}

	public function testAddColumnInfersSchemaFromColumn(): void
	{
		$filters = (new Filters(A::class))
			->addColumn('id')
			->addColumn('propA')
			->addColumn('createdAt');

		$props = (array) $filters->toJsonSchema()['$defs']['FilterCondition']['properties'];

		$this->assertEquals('integer', $props['id']['anyOf'][0]['type']);
		$this->assertEquals('string', $props['propA']['anyOf'][0]['type']);
		$this->assertEquals('array', $props['propA']['anyOf'][1]['type']);
		$this->assertEquals('datetime', $props['createdAt']['x-filterType']);
	}

	public function testDescribeKeepsInferredSchemaWhenNoneGiven(): void
	{
		$filters = (new Filters(A::class))
			->addColumn('id')
			->describe("The id");

		$props = (array) $filters->toJsonSchema()['$defs']['FilterCondition']['properties'];

		$this->assertEquals('The id', $props['id']['description']);
		$this->assertEquals('integer', $props['id']['anyOf'][0]['type']);
	}

	public static function filterValueProvider(): array
	{
		$int = ['type' => 'integer'];
		$intOrList = ['anyOf' => [['type' => 'integer'], ['type' => 'array', 'items' => ['type' => 'integer']]]];
		$link = [
			'type' => 'object',
			'properties' => ['entity' => ['type' => 'string'], 'id' => ['type' => 'integer']],
			'required' => ['entity']
		];

		return [
			'integer' => [$int, 1, true],
			'integer as string, as JMAP IDs are' => [$int, "1", true],
			'boolean is not an integer' => [$int, true, false],
			'text is not an integer' => [$int, "abc", false],
			'null is always allowed' => [$int, null, true],
			'anyOf first branch' => [$intOrList, 2, true],
			'anyOf second branch' => [$intOrList, [1, "2"], true],
			'boolean in a list of integers' => [$intOrList, [1, true], false],
			'string may be a number' => [['type' => 'string'], 12, true],
			'boolean as 0 or 1' => [['type' => 'boolean'], 1, true],
			'enum is not enforced' => [['type' => 'integer', 'enum' => [10, 20]], 5, true],
			'object' => [$link, ['entity' => 'Contact', 'id' => "3"], true],
			'object without required key' => [$link, ['id' => 3], false],
			'object with invalid property' => [$link, ['entity' => 'Contact', 'id' => true], false],
			'string is not an object' => [$link, 'Contact', false],
			'no schema accepts anything' => [null, true, true],
		];
	}

	#[DataProvider('filterValueProvider')]
	public function testFilterValueIsCheckedAgainstSchema(?array $schema, mixed $value, bool $valid): void
	{
		$filters = (new Filters(A::class))->add('foo', function () {});
		if (isset($schema)) {
			$filters->describe("Foo", $schema);
		}

		if (!$valid) {
			$this->expectException(InvalidArguments::class);
		}

		$filters->apply(A::find(), ['foo' => $value]);
		$this->addToAssertionCount(1);
	}

	public function testFilterValueIsCheckedInsideOperator(): void
	{
		$filters = (new Filters(A::class))
			->add('foo', function () {})
			->describe("Foo", ['type' => 'integer']);

		$this->expectException(InvalidArguments::class);
		$filters->apply(A::find(), ['operator' => 'OR', 'conditions' => [['foo' => 1], ['foo' => true]]]);
	}

	public function testDefaultIsNotChecked(): void
	{
		$filters = (new Filters(A::class))
			->add('foo', function () {}, true)
			->describe("Foo", ['type' => 'integer']);

		$filters->apply(A::find(), []);
		$this->addToAssertionCount(1);
	}

	public function testToJsonSchemaForAllEntities(): void
	{
		foreach (EntityType::findAll() as $type) {
			// Another test may have uninstalled or removed the module, the entity types are still cached
			if (!\go\core\model\Module::findById($type->getModuleId())?->enabled) {
				continue;
			}
			$cls = $type->getClassName();
			if (!is_a($cls, Entity::class, true)) {
				continue;
			}

			$schema = $cls::getFilters()->toJsonSchema();
			$props = (array) $schema['$defs']['FilterCondition']['properties'];

			$this->assertArrayHasKey('text', $props, $type->getName());
			$this->assertNotFalse(json_encode($schema), $type->getName());
		}
	}
}
