<?php
namespace go\core\controller;

use go\core\auth\TemporaryState;
use go\core\model\Acl;
use go\core\model\Group;
use go\core\model\User as UserModel;
use go\core\model\Workspace as WorkspaceModel;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Workspaces of the neo webclient are personal (docs/neo-workspace.md): another ordinary user can't read or change
 * them, a forged owner or ACL doesn't take effect and the layouts are validated.
 */
class WorkspaceTest extends TestCase
{
	private static UserModel $userA;
	private static UserModel $userB;
	private $authState;

	public static function setUpBeforeClass(): void
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(UserModel::ID_SUPER_ADMIN));

		try {
			self::$userA = self::newUser();
			self::$userB = self::newUser();
		} finally {
			go()->setAuthState($authState);
		}
	}

	public static function tearDownAfterClass(): void
	{
		$authState = go()->getAuthState();
		go()->setAuthState(new TemporaryState(UserModel::ID_SUPER_ADMIN));

		// workspaces go with their owner (foreign key), their ACLs with the workspaces
		self::deleteWorkspaces();
		UserModel::delete(['id' => [self::$userA->id, self::$userB->id]]);

		go()->setAuthState($authState);
	}

	protected function setUp(): void
	{
		$this->authState = go()->getAuthState();
	}

	protected function tearDown(): void
	{
		go()->setAuthState(new TemporaryState(UserModel::ID_SUPER_ADMIN));
		self::deleteWorkspaces();
		go()->setAuthState($this->authState);
	}

	private static function deleteWorkspaces(): void
	{
		$ids = [self::$userA->id, self::$userB->id];
		$aclIds = go()->getDbConnection()->selectSingleValue('aclId')->from('core_workspace')->where('createdBy', 'IN', $ids)->all();
		go()->getDbConnection()->update('core_user', ['defaultWorkspaceId' => null], ['id' => $ids])->execute();
		go()->getDbConnection()->delete('core_workspace', ['createdBy' => $ids])->execute();
		if ($aclIds) {
			go()->getDbConnection()->delete('core_acl', ['id' => $aclIds])->execute();
		}
	}

	private static function newUser(): UserModel
	{
		$name = uniqid('wsuser');
		$user = new UserModel();
		$user->setValues([
			'username' => $name,
			'displayName' => $name,
			'email' => $name . '@example.com',
			'password' => 'Pa55word!!xyz'
		]);
		self::assertTrue($user->save(), var_export($user->getValidationErrors(), true));

		return $user;
	}

	private static function actAs(UserModel $user): void
	{
		go()->setAuthState(new TemporaryState($user->id));
	}

	/**
	 * A valid layout: the panels side by side
	 */
	private static function layout(array $panelIds): array
	{
		$items = [];
		$nodes = [];
		$children = [];
		foreach ($panelIds as $id) {
			$items[$id] = ['title' => $id];
			$nodes['tabs-' . $id] = ['type' => 'tabs', 'items' => [$id], 'activeItemId' => $id];
			$children[] = 'tabs-' . $id;
		}

		if (count($children) > 1) {
			$nodes['split'] = ['type' => 'split', 'orientation' => 'horizontal', 'children' => $children, 'sizes' => array_fill(0, count($children), 1 / count($children))];
			$center = 'split';
		} else {
			$center = $children[0];
		}
		$nodes['root'] = ['type' => 'edge-zone', 'zones' => ['center' => ['nodeId' => $center]]];

		return ['schema' => 'neo.dock.zone.v1', 'root' => 'root', 'items' => $items, 'nodes' => $nodes];
	}

	private static function panels(): array
	{
		return [
			'p1' => ['module' => 'notes', 'route' => 'note/5'],
			'p2' => ['module' => 'addressbook', 'route' => '']
		];
	}

	private function set(array $params): array
	{
		return (new Workspace())->set($params)->getArray();
	}

	/**
	 * Creates a workspace of user A through the API
	 */
	private function createForA(array $properties = []): int
	{
		self::actAs(self::$userA);
		$result = $this->set(['create' => ['c1' => array_merge(['name' => 'Mail', 'panels' => self::panels(), 'layouts' => ['wide' => self::layout(['p1', 'p2'])]], $properties)]]);
		$this->assertArrayHasKey('c1', $result['created'] ?? [], var_export($result['notCreated'] ?? null, true));

		return (int) $result['created']['c1']['id'];
	}

	public function testQueryCreatesOneDefaultWorkspace()
	{
		self::actAs(self::$userA);
		$first = (new Workspace())->query(['filter' => ['mine' => true]])->getArray();
		$second = (new Workspace())->query(['filter' => ['mine' => true]])->getArray();

		$this->assertCount(1, $first['ids']);
		$this->assertSame($first['ids'], $second['ids']);
		$this->assertSame((int) $first['ids'][0], WorkspaceModel::findDefaultId(self::$userA->id));

		$workspace = WorkspaceModel::findById($first['ids'][0]);
		$this->assertSame(go()->t("Default"), $workspace->name);
		$this->assertEquals(self::$userA->id, $workspace->getCreatedBy());
	}

	public function testConcurrentFirstOpenCreatesOneDefault()
	{
		$userId = self::$userA->id;
		// one run first: the processes would otherwise build the same disk cache files at once
		exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/fixtures/workspace-ensure-default.php') . ' ' . self::$userB->id . ' 0 2>&1', $warmup, $code);
		$this->assertSame(0, $code, implode("\n", $warmup));

		$start = microtime(true) + 1.5;
		$processes = [];
		$outputs = [];

		// separate PHP processes with their own database connections, started at the same moment
		for ($i = 0; $i < 4; $i++) {
			$processes[] = proc_open(
				[PHP_BINARY, __DIR__ . '/fixtures/workspace-ensure-default.php', (string) $userId, (string) $start],
				[1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
				$pipes
			);
			$outputs[] = $pipes;
		}

		$defaults = [];
		foreach ($processes as $i => $process) {
			$out = stream_get_contents($outputs[$i][1]) . stream_get_contents($outputs[$i][2]);
			$this->assertSame(0, proc_close($process), $out);
			$this->assertMatchesRegularExpression('/default:(\d+)/', $out);
			preg_match('/default:(\d+)/', $out, $m);
			$defaults[] = $m[1];
		}

		$this->assertCount(1, array_unique($defaults));
		$count = go()->getDbConnection()->selectSingleValue('count(*)')->from('core_workspace')->where('createdBy', '=', $userId)->single();
		$this->assertEquals(1, $count);
		$this->assertEquals($defaults[0], WorkspaceModel::findDefaultId($userId));
	}

	public function testOwnerGetsManagePermissionAndAPrivateAcl()
	{
		$id = $this->createForA();
		$workspace = WorkspaceModel::findById($id);

		$this->assertEquals(self::$userA->id, $workspace->getCreatedBy());
		$this->assertSame([Group::findPersonalGroupID(self::$userA->id) => Acl::LEVEL_MANAGE], $workspace->getAcl()->getArray());
	}

	public function testOtherUserCantQueryOrGet()
	{
		$id = $this->createForA();

		self::actAs(self::$userB);
		$query = (new Workspace())->query([])->getArray();
		$this->assertNotContains($id, array_map('intval', $query['ids']));

		$get = (new Workspace())->get(['ids' => [$id]])->getArray();
		$this->assertEmpty($get['list']);
		$this->assertContains($id, array_map('intval', $get['notFound']));
	}

	public function testOtherUserCantUpdate()
	{
		$id = $this->createForA();

		self::actAs(self::$userB);
		$result = $this->set(['update' => [$id => ['name' => 'Hacked']]]);

		$this->assertArrayHasKey($id, $result['notUpdated'] ?? []);
		$this->assertSame('Mail', WorkspaceModel::findById($id)->name);
	}

	public function testOtherUserCantDestroy()
	{
		$id = $this->createForA();

		self::actAs(self::$userB);
		$result = $this->set(['destroy' => [$id]]);

		$this->assertArrayHasKey($id, $result['notDestroyed'] ?? []);
		$this->assertNotNull(WorkspaceModel::findById($id));
	}

	public function testOwnerCanUpdateOneProfileWithAPatch()
	{
		$id = $this->createForA();

		$result = $this->set(['update' => [$id => ['layouts/medium' => self::layout(['p1'])]]]);

		$this->assertArrayNotHasKey($id, $result['notUpdated'] ?? [], var_export($result['notUpdated'][$id] ?? null, true));
		$layouts = WorkspaceModel::findById($id)->getLayouts()->getArray();
		$this->assertSame(['wide', 'medium'], array_keys($layouts));
	}

	public static function forgedCreateProperties(): array
	{
		return [
			'createdBy' => [['createdBy' => 'B']],
			'aclId' => [['aclId' => 1]],
			'acl' => [['acl' => [Group::ID_EVERYONE => Acl::LEVEL_MANAGE]]],
		];
	}

	#[DataProvider('forgedCreateProperties')]
	public function testForgedOwnerOrAclOnCreateIsRefused(array $forged)
	{
		if (isset($forged['createdBy'])) {
			$forged['createdBy'] = self::$userB->id;
		}

		self::actAs(self::$userA);
		$result = $this->set(['create' => ['c1' => array_merge(['name' => 'Forged'], $forged)]]);

		$this->assertArrayHasKey('c1', $result['notCreated'] ?? []);
		$this->assertSame(0, (int) go()->getDbConnection()->selectSingleValue('count(*)')->from('core_workspace')->where('name', '=', 'Forged')->single());
	}

	#[DataProvider('forgedCreateProperties')]
	public function testForgedOwnerOrAclOnUpdateIsRefused(array $forged)
	{
		if (isset($forged['createdBy'])) {
			$forged['createdBy'] = self::$userB->id;
		}

		$id = $this->createForA();
		$before = WorkspaceModel::findById($id);
		$aclId = $before->findAclId();
		$acl = $before->getAcl()->getArray();

		self::actAs(self::$userA);
		$result = $this->set(['update' => [$id => $forged]]);

		$this->assertArrayHasKey($id, $result['notUpdated'] ?? []);
		$after = WorkspaceModel::findById($id);
		$this->assertEquals(self::$userA->id, $after->getCreatedBy());
		$this->assertSame($aclId, $after->findAclId());
		$this->assertSame($acl, $after->getAcl()->getArray());
	}

	public function testUserCantSetDefaultWorkspaceOfOwnAccount()
	{
		$id = $this->createForA();

		self::actAs(self::$userA);
		(new User())->set(['update' => [self::$userA->id => ['defaultWorkspaceId' => $id + 1000]]]);

		$this->assertNotSame($id + 1000, UserModel::findById(self::$userA->id)->getDefaultWorkspaceId());
	}

	public static function invalidLayouts(): array
	{
		$valid = self::layout(['p1', 'p2']);

		$wrongSchema = $valid;
		$wrongSchema['schema'] = 'neo.dock.layout.v1';

		$unknownItem = self::layout(['p1', 'p2', 'p9']);

		$badSizes = $valid;
		$badSizes['nodes']['split']['sizes'] = [0.7, 0.7];

		$negative = $valid;
		$negative['nodes']['split']['sizes'] = [1.5, -0.5];

		$missingChild = $valid;
		$missingChild['nodes']['split']['children'] = ['tabs-p1', 'nowhere'];

		$cycle = $valid;
		$cycle['nodes']['split']['children'] = ['tabs-p1', 'split'];

		$twice = $valid;
		$twice['nodes']['tabs-p2']['items'] = ['p1'];
		$twice['nodes']['tabs-p2']['activeItemId'] = 'p1';

		$blueprint = $valid;
		$blueprint['items']['p1']['blueprint'] = ['module' => 'Neo.component.Base'];

		$noRoot = $valid;
		$noRoot['root'] = 'gone';

		$extraKey = $valid;
		$extraKey['script'] = 'alert(1)';

		return [
			'schema' => [['wide' => $wrongSchema]],
			'item is no panel' => [['wide' => $unknownItem]],
			'sizes sum' => [['wide' => $badSizes]],
			'negative size' => [['wide' => $negative]],
			'missing child' => [['wide' => $missingChild]],
			'cycle' => [['wide' => $cycle]],
			'item twice' => [['wide' => $twice]],
			'blueprint' => [['wide' => $blueprint]],
			'root' => [['wide' => $noRoot]],
			'unexpected key' => [['wide' => $extraKey]],
			'unknown profile' => [['narrow' => $valid]],
		];
	}

	#[DataProvider('invalidLayouts')]
	public function testInvalidLayoutsAreRejected(array $layouts)
	{
		self::actAs(self::$userA);
		$result = $this->set(['create' => ['c1' => ['name' => 'Bad', 'panels' => self::panels(), 'layouts' => $layouts]]]);

		$this->assertArrayHasKey('layouts', $result['notCreated']['c1']->validationErrors ?? [], var_export($result['created'] ?? null, true));
	}

	public static function invalidPanels(): array
	{
		return [
			'list' => [[['module' => 'notes']]],
			'bad id' => [['p 1' => ['module' => 'notes']]],
			'unknown key' => [['p1' => ['module' => 'notes', 'html' => '<b>']]],
			'module twice' => [['p1' => ['module' => 'notes'], 'p2' => ['module' => 'notes']]],
			'no module' => [['p1' => ['route' => 'x']]],
			'not installed module' => [['p1' => ['module' => 'nosuchmodule']]],
			'too many' => [array_combine(array_map(fn($i) => 'p' . $i, range(1, 31)), array_map(fn($i) => ['module' => 'm' . $i], range(1, 31)))],
		];
	}

	#[DataProvider('invalidPanels')]
	public function testInvalidPanelsAreRejected(array $panels)
	{
		self::actAs(self::$userA);
		$result = $this->set(['create' => ['c1' => ['name' => 'Bad', 'panels' => $panels]]]);

		$this->assertArrayHasKey('panels', $result['notCreated']['c1']->validationErrors ?? [], var_export($result['created'] ?? null, true));
	}

	public function testTooLargeIsRejected()
	{
		self::actAs(self::$userA);
		$panels = self::panels();
		$panels['p1']['route'] = str_repeat('a', 1000);
		$layout = self::layout(['p1', 'p2']);
		$layout['items']['p1']['title'] = str_repeat('t', 190);

		$result = $this->set(['create' => ['c1' => [
			'name' => 'Big',
			'panels' => $panels,
			'layouts' => ['wide' => $layout, 'medium' => $layout],
			'savedPanels' => $panels,
			'savedLayouts' => array_fill_keys(['wide', 'medium'], $layout) + ['x' => str_repeat('x', 300000)]
		]]]);

		$this->assertArrayHasKey('c1', $result['notCreated'] ?? []);
	}

	public function testDeletingTheDefaultMovesItAndTheLastOneStays()
	{
		self::actAs(self::$userA);
		$defaultId = WorkspaceModel::ensureDefault(self::$userA->id);
		$otherId = $this->createForA();

		$result = $this->set(['destroy' => [$defaultId]]);
		$this->assertContains($defaultId, array_map('intval', $result['destroyed'] ?? []));
		$this->assertSame($otherId, WorkspaceModel::findDefaultId(self::$userA->id));

		$result = $this->set(['destroy' => [$otherId]]);
		$this->assertArrayHasKey($otherId, $result['notDestroyed'] ?? []);
		$this->assertNotNull(WorkspaceModel::findById($otherId));
	}

	public function testIfInStateIsChecked()
	{
		$id = $this->createForA();
		$state = (new Workspace())->get(['ids' => [$id]])->getArray()['state'];

		$this->set(['update' => [$id => ['name' => 'Changed elsewhere']]]);

		$this->expectException(\go\core\jmap\exception\StateMismatch::class);
		$this->set(['ifInState' => $state, 'update' => [$id => ['name' => 'Late']]]);
	}
}
