<?php
namespace go\modules\legacy\site;

use GO\Base\Exception\AccessDenied;
use GO\Base\Model\Acl;
use GO\Site\Controller\ContentController;
use GO\Site\Controller\MenuController;
use GO\Site\Controller\MenuItemController;
use GO\Site\Controller\MultifileController;
use GO\Site\Controller\SiteController;
use GO\Site\Model\Content;
use GO\Site\Model\Menu;
use GO\Site\Model\MenuItem;
use GO\Site\Model\Site;
use go\core\auth\TemporaryState;
use go\core\model\User;
use go\modules\business\ModuleTablesTrait;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../../business/fixtures/ModuleTablesTrait.php';

/**
 * Content items, menus and menu items of the site module have no ACL of their own: the controllers check the ACL of
 * their site. A user who may only read a site can't change its content or menus, a user without access to a site
 * can't read them, and a writer of one site can't move items into another.
 */
class SitePermissionTest extends TestCase
{
	use ModuleTablesTrait;

	private static User $reader;
	private static User $writer;
	private static User $editor;
	private static User $outsider;
	private static Site $site;
	private static Site $otherSite;
	private static Content $content;
	private static Content $otherContent;
	private static Menu $menu;
	private static MenuItem $menuItem;
	private static Menu $secondMenu;
	private static MenuItem $secondMenuItem;
	private static Menu $otherMenu;

	private $authState;
	private bool $ignoreAcl;
	private bool $disableModelCache;
	private ?string $requestMethod;

	public static function setUpBeforeClass(): void
	{
		try {
			self::installModuleTables(null, 'site', go()->getEnvironment()->getInstallPath() . '/modules/site/install/install.sql');

			$ignore = \GO::setIgnoreAclPermissions();
			self::$reader = self::createUser('sitereader');
			self::$writer = self::createUser('sitewriter');
			self::$editor = self::createUser('siteeditor');
			self::$outsider = self::createUser('siteoutsider');

			self::$site = self::createSite('Site permission test');
			self::$site->acl->addGroup(self::$reader->getPersonalGroup()->id, Acl::READ_PERMISSION);
			self::$site->acl->addGroup(self::$writer->getPersonalGroup()->id, Acl::DELETE_PERMISSION);
			self::$site->acl->addGroup(self::$editor->getPersonalGroup()->id, Acl::WRITE_PERMISSION);
			self::$otherSite = self::createSite('Other site');

			self::$content = self::createContent(self::$site, 'home');
			self::$otherContent = self::createContent(self::$otherSite, 'other');

			self::$menu = self::createMenu(self::$site, 'Main');
			self::$menuItem = self::createMenuItem(self::$menu, 'Home', self::$content->id);
			self::$secondMenu = self::createMenu(self::$site, 'Footer');
			self::$secondMenuItem = self::createMenuItem(self::$secondMenu, 'Contact');
			self::$otherMenu = self::createMenu(self::$otherSite, 'Other');
			\GO::setIgnoreAclPermissions($ignore);
		} catch (\Throwable $e) {
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		go()->setAuthState(new TemporaryState(User::ID_SUPER_ADMIN));
		\GO::session()->setCurrentUser(User::ID_SUPER_ADMIN);
		\GO::setIgnoreAclPermissions(true);
		// only the rows of this test's sites: the tables may hold other fixtures
		$siteIds = array_map(fn(Site $site) => $site->id, array_filter([self::$site ?? null, self::$otherSite ?? null], fn($site) => $site && !$site->isNew));
		if ($siteIds) {
			$db = go()->getDbConnection();
			$menuIds = $db->selectSingleValue('id')->from('site_menu')->where(['site_id' => $siteIds])->all();
			if ($menuIds) {
				$db->delete('site_menu_item', ['menu_id' => $menuIds])->execute();
				$db->delete('site_menu', ['id' => $menuIds])->execute();
			}
			$db->delete('site_content', ['site_id' => $siteIds])->execute();
		}
		foreach ([self::$site ?? null, self::$otherSite ?? null] as $site) {
			if ($site && !$site->isNew) {
				$site->delete(true);
			}
		}
		$users = array_filter([self::$reader ?? null, self::$writer ?? null, self::$editor ?? null, self::$outsider ?? null]);
		if ($users) {
			User::delete(['id' => array_map(fn(User $u) => $u->id, $users)]);
		}
		\GO::setIgnoreAclPermissions(false);
		self::uninstallModuleTables();
	}

	protected function setUp(): void
	{
		$this->authState = go()->getAuthState();
		$this->ignoreAcl = \GO::$ignoreAclPermissions;
		\GO::$ignoreAclPermissions = false;
		$this->disableModelCache = \GO::$disableModelCache;
		\GO::$disableModelCache = true;
		$this->requestMethod = $_SERVER['REQUEST_METHOD'] ?? null;
	}

	protected function tearDown(): void
	{
		if ($this->requestMethod === null) {
			unset($_SERVER['REQUEST_METHOD']);
		} else {
			$_SERVER['REQUEST_METHOD'] = $this->requestMethod;
		}
		\GO::session()->setCurrentUser(User::ID_SUPER_ADMIN);
		go()->setAuthState($this->authState);
		\GO::$ignoreAclPermissions = $this->ignoreAcl;
		\GO::$disableModelCache = $this->disableModelCache;
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
		self::assertTrue($user->save(), var_export($user->getValidationErrors(), true));
		return $user;
	}

	private static function createSite(string $name): Site
	{
		$site = new Site();
		$site->setAttributes(['name' => $name, 'domain' => uniqid() . '.example.com', 'module' => 'defaultsite', 'language' => 'en']);
		self::assertTrue($site->save(), var_export($site->getValidationErrors(), true));
		return $site;
	}

	private static function createContent(Site $site, string $slug): Content
	{
		$content = new Content();
		$content->setAttributes(['site_id' => $site->id, 'title' => ucfirst($slug), 'slug' => $slug, 'content' => 'Text']);
		self::assertTrue($content->save(), var_export($content->getValidationErrors(), true));
		return $content;
	}

	private static function createMenu(Site $site, string $label): Menu
	{
		$menu = new Menu();
		$menu->setAttributes(['site_id' => $site->id, 'label' => $label, 'menu_slug' => strtolower($label)]);
		self::assertTrue($menu->save(), var_export($menu->getValidationErrors(), true));
		return $menu;
	}

	private static function createMenuItem(Menu $menu, string $label, ?int $contentId = null): MenuItem
	{
		$item = new MenuItem();
		$item->setAttributes(['menu_id' => $menu->id, 'label' => $label, 'content_id' => $contentId]);
		self::assertTrue($item->save(), var_export($item->getValidationErrors(), true));
		return $item;
	}

	/**
	 * Runs a controller action as a user
	 *
	 * @param object $controller
	 * @param string $action method name, e.g. actionUpdate
	 * @param array $args arguments of the method
	 * @param User $user
	 * @param bool $post a POST request (the update and create actions save on POST only)
	 * @return string the output
	 */
	private function runAction(object $controller, string $action, array $args, User $user, bool $post = false): string
	{
		$_SERVER['REQUEST_METHOD'] = $post ? 'POST' : 'GET';
		go()->setAuthState(new TemporaryState($user->id));
		\GO::session()->setCurrentUser($user->id);

		$method = new \ReflectionMethod($controller, $action);
		ob_start();
		try {
			$result = $method->invokeArgs($controller, $args);
		} finally {
			$output = ob_get_clean();
		}
		return is_array($result) ? json_encode($result) : $output;
	}

	private function contentTitle(int $id): string
	{
		return (string) go()->getDbConnection()->selectSingleValue('title')->from('site_content')->where(['id' => $id])->single();
	}

	public function testReaderCanLoadButNotChangeContent(): void
	{
		$output = $this->runAction(new ContentController(), 'actionUpdate', [['id' => self::$content->id]], self::$reader);
		$this->assertStringContainsString('"success":true', $output);

		try {
			$this->runAction(new ContentController(), 'actionUpdate', [['id' => self::$content->id, 'title' => 'Changed']], self::$reader, true);
			$this->fail('A reader may not change content');
		} catch (AccessDenied $e) {
			$this->assertSame('Home', $this->contentTitle(self::$content->id));
		}
	}

	public function testWriterCanChangeContent(): void
	{
		$this->runAction(new ContentController(), 'actionUpdate', [['id' => self::$content->id, 'title' => 'Welcome']], self::$writer, true);
		$this->assertSame('Welcome', $this->contentTitle(self::$content->id));

		\GO::$ignoreAclPermissions = true;
		go()->getDbConnection()->update('site_content', ['title' => 'Home'], ['id' => self::$content->id])->execute();
	}

	public function testOutsiderCannotReadContent(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new ContentController(), 'actionUpdate', [['id' => self::$content->id]], self::$outsider);
	}

	public function testOutsiderCannotReadContentTree(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new SiteController(), 'actionTree', [['node' => self::$site->id . '_content_' . self::$content->id]], self::$outsider);
	}

	public function testReaderCannotCreateOrDeleteContent(): void
	{
		try {
			$this->runAction(new ContentController(), 'actionCreate', [['site_id' => self::$site->id, 'title' => 'New', 'baseslug' => 'new']], self::$reader, true);
			$this->fail('A reader may not add content');
		} catch (AccessDenied $e) {
		}

		$this->expectException(AccessDenied::class);
		$this->runAction(new ContentController(), 'actionDelete', [['id' => self::$content->id]], self::$reader, true);
	}

	public function testUpdateDoesNotMoveContent(): void
	{
		// the site and the parent change only by sorting in the tree
		$this->runAction(new ContentController(), 'actionUpdate', [['id' => self::$content->id, 'parent_id' => self::$otherContent->id, 'site_id' => self::$otherSite->id]], self::$writer, true);
		$row = go()->getDbConnection()->select('parent_id, site_id')->from('site_content')->where(['id' => self::$content->id])->single();
		$this->assertNull($row['parent_id']);
		$this->assertEquals(self::$site->id, $row['site_id']);
	}

	public function testWriterCannotCreateContentBelowAnotherSite(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new ContentController(), 'actionCreate', [['site_id' => self::$site->id, 'parent_id' => self::$otherContent->id, 'title' => 'New', 'baseslug' => 'new']], self::$writer, true);
	}

	public function testCreateCannotOverwriteAnotherSitesRecords(): void
	{
		// isNew and id are writable properties of a legacy model: a create must not turn into an update
		// (below a parent with a default child template: the test has no site module config for the default)
		\GO::$ignoreAclPermissions = true;
		go()->getDbConnection()->update('site_content', ['default_child_template' => 'page'], ['id' => self::$content->id])->execute();
		\GO::$ignoreAclPermissions = false;
		$this->runAction(new ContentController(), 'actionCreate', [['site_id' => self::$site->id, 'parent_id' => self::$content->id, 'isNew' => 0, 'id' => self::$otherContent->id, 'title' => 'Hijacked', 'baseslug' => 'hijacked']], self::$writer, true);
		$this->assertSame('Other', $this->contentTitle(self::$otherContent->id));

		$_POST = ['isNew' => 0, 'id' => self::$otherMenu->id, 'site_id' => self::$site->id, 'label' => 'Hijacked'];
		try {
			$this->runAction(new MenuController(), 'actionCreate', [self::$site->id], self::$writer, true);
		} finally {
			$_POST = [];
		}
		$row = go()->getDbConnection()->select('label, site_id')->from('site_menu')->where(['id' => self::$otherMenu->id])->single();
		$this->assertSame('Other', $row['label']);
		$this->assertEquals(self::$otherSite->id, $row['site_id']);

		\GO::$ignoreAclPermissions = true;
		$db = go()->getDbConnection();
		$db->delete('site_content', ['site_id' => self::$site->id, 'title' => 'Hijacked'])->execute();
		$db->update('site_content', ['default_child_template' => null], ['id' => self::$content->id])->execute();
		$db->delete('site_menu', ['site_id' => self::$site->id, 'label' => 'Hijacked'])->execute();
	}

	public function testListsDoNotDelete(): void
	{
		// DbStore deletes the records of delete_keys before it lists them
		$_REQUEST = ['delete_keys' => json_encode([self::$content->id])];
		try {
			$this->runAction(new MenuController(), 'actionContentStore', [self::$menu->id], self::$reader);
			$_REQUEST = ['delete_keys' => json_encode([self::$secondMenuItem->id])];
			$this->runAction(new MenuItemController(), 'actionParentStore', [0, self::$secondMenu->id], self::$reader);
		} finally {
			$_REQUEST = [];
		}
		$db = go()->getDbConnection();
		$this->assertNotEmpty($db->selectSingleValue('id')->from('site_content')->where(['id' => self::$content->id])->single());
		$this->assertNotEmpty($db->selectSingleValue('id')->from('site_menu_item')->where(['id' => self::$secondMenuItem->id])->single());
	}

	public function testEditorCanChangeButNotDelete(): void
	{
		$this->runAction(new ContentController(), 'actionUpdate', [['id' => self::$content->id, 'title' => 'Edited']], self::$editor, true);
		$this->assertSame('Edited', $this->contentTitle(self::$content->id));
		\GO::$ignoreAclPermissions = true;
		go()->getDbConnection()->update('site_content', ['title' => 'Home'], ['id' => self::$content->id])->execute();
		\GO::$ignoreAclPermissions = false;

		foreach ([
			[new ContentController(), 'actionDelete', [['id' => self::$content->id]]],
			[new MenuController(), 'actionDelete', [self::$menu->id, self::$site->id]],
			[new MenuItemController(), 'actionDelete', [self::$menuItem->id, self::$menu->id]]
		] as [$controller, $action, $args]) {
			try {
				$this->runAction($controller, $action, $args, self::$editor, true);
				$this->fail(get_class($controller) . '::' . $action . ' needs delete permission');
			} catch (AccessDenied $e) {
			}
		}
		$db = go()->getDbConnection();
		$this->assertNotEmpty($db->selectSingleValue('id')->from('site_content')->where(['id' => self::$content->id])->single());
		$this->assertNotEmpty($db->selectSingleValue('id')->from('site_menu')->where(['id' => self::$menu->id])->single());
		$this->assertNotEmpty($db->selectSingleValue('id')->from('site_menu_item')->where(['id' => self::$menuItem->id])->single());
	}

	public function testSortKeepsMenuItemsInTheirMenu(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new SiteController(), 'actionTreeSort', [json_encode([self::$site->id . '_menuitem_' . self::$secondMenuItem->id]), self::$site->id . '_menuitem_' . self::$menuItem->id], self::$writer, true);
	}

	public function testSortCannotMoveContentBelowItself(): void
	{
		\GO::$ignoreAclPermissions = true;
		$child = new Content();
		$child->setAttributes(['site_id' => self::$site->id, 'parent_id' => self::$content->id, 'title' => 'Child', 'slug' => 'home/child', 'content' => 'Text']);
		$this->assertTrue($child->save());
		\GO::$ignoreAclPermissions = false;

		try {
			// also with a zero padded id, which finds the same record
			foreach (['', '0'] as $pad) {
				try {
					$this->runAction(new SiteController(), 'actionTreeSort', [json_encode([self::$site->id . '_content_' . $pad . self::$content->id]), self::$site->id . '_content_' . $child->id], self::$writer, true);
					$this->fail('Content may not be moved below its own child');
				} catch (AccessDenied $e) {
					$this->assertNull(go()->getDbConnection()->selectSingleValue('parent_id')->from('site_content')->where(['id' => self::$content->id])->single());
				}
			}
		} finally {
			\GO::$ignoreAclPermissions = true;
			go()->getDbConnection()->delete('site_content', ['id' => $child->id])->execute();
		}
	}

	public function testMenuItemOfDeletedContentStaysEditable(): void
	{
		\GO::$ignoreAclPermissions = true;
		$content = self::createContent(self::$site, 'gone');
		$item = self::createMenuItem(self::$secondMenu, 'Gone', $content->id);
		go()->getDbConnection()->delete('site_content', ['id' => $content->id])->execute();
		\GO::$ignoreAclPermissions = false;

		try {
			$output = $this->runAction(new MenuItemController(), 'actionLoad', [$item->id, self::$secondMenu->id], self::$writer);
			$this->assertStringContainsString('"success":true', $output);

			$_POST = ['label' => 'Renamed'];
			$this->runAction(new MenuItemController(), 'actionUpdate', [$item->id, self::$secondMenu->id], self::$writer, true);
			$this->assertSame('Renamed', go()->getDbConnection()->selectSingleValue('label')->from('site_menu_item')->where(['id' => $item->id])->single());
		} finally {
			$_POST = [];
			\GO::$ignoreAclPermissions = true;
			go()->getDbConnection()->delete('site_menu_item', ['id' => $item->id])->execute();
		}
	}

	public function testMultifileChangesNeedManagePermission(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new MultifileController(), 'actionSaveSort', [['sort' => json_encode([])]], self::$writer, true);
	}

	public function testReaderCannotSortTheTree(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new SiteController(), 'actionTreeSort', [json_encode([self::$site->id . '_content_' . self::$content->id]), self::$site->id . '_content'], self::$reader, true);
	}

	public function testWriterCannotSortAnotherSitesContent(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new SiteController(), 'actionTreeSort', [json_encode([self::$otherSite->id . '_content_' . self::$otherContent->id]), self::$site->id . '_content'], self::$writer, true);
	}

	public function testReaderCannotChangeMenus(): void
	{
		try {
			$this->runAction(new MenuController(), 'actionDelete', [self::$menu->id, self::$site->id], self::$reader, true);
			$this->fail('A reader may not delete a menu');
		} catch (AccessDenied $e) {
		}

		try {
			$_POST = ['label' => 'New item'];
			$this->runAction(new MenuItemController(), 'actionCreate', [self::$menu->id], self::$reader, true);
			$this->fail('A reader may not add a menu item');
		} catch (AccessDenied $e) {
		} finally {
			$_POST = [];
		}

		$this->expectException(AccessDenied::class);
		$this->runAction(new MenuItemController(), 'actionCreateFromContent', [
			json_encode(['type' => 'menu', 'modelId' => self::$menu->id]),
			json_encode(['type' => 'content', 'modelId' => self::$content->id])
		], self::$reader, true);
	}

	public function testOutsiderCannotListMenuParents(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new MenuItemController(), 'actionParentStore', [0, self::$menu->id], self::$outsider);
	}

	public function testWriterCannotLinkAnotherSitesContent(): void
	{
		$this->expectException(AccessDenied::class);
		$this->runAction(new MenuItemController(), 'actionCreateFromContent', [
			json_encode(['type' => 'menu', 'modelId' => self::$menu->id]),
			json_encode(['type' => 'content', 'modelId' => self::$otherContent->id])
		], self::$writer, true);
	}

	public function testWriterCreatesMenuItemFromContentOnAMenu(): void
	{
		$this->runAction(new MenuItemController(), 'actionCreateFromContent', [
			json_encode(['type' => 'menu', 'modelId' => self::$menu->id]),
			json_encode(['type' => 'content', 'modelId' => self::$content->id])
		], self::$writer, true);

		$row = go()->getDbConnection()->select('id, parent_id, label')->from('site_menu_item')
			->where(['menu_id' => self::$menu->id, 'content_id' => self::$content->id])
			->andWhere('id', '!=', self::$menuItem->id)->single();
		$this->assertNotEmpty($row);
		// dropped on the menu itself: a top level item
		$this->assertNull($row['parent_id']);

		\GO::$ignoreAclPermissions = true;
		go()->getDbConnection()->delete('site_menu_item', ['id' => $row['id']])->execute();
	}

	public function testSiteSubmitIgnoresAclAndOwner(): void
	{
		$aclId = self::$site->acl_id;
		$userId = self::$site->user_id;

		$this->runAction(new SiteController(), 'actionSubmit', [[
			'id' => self::$site->id,
			'name' => 'Renamed',
			'acl_id' => self::$otherSite->acl_id,
			'user_id' => self::$writer->id
		]], self::$writer, true);

		$row = go()->getDbConnection()->select('name, acl_id, user_id')->from('site_sites')->where(['id' => self::$site->id])->single();
		$this->assertSame('Renamed', $row['name']);
		$this->assertEquals($aclId, $row['acl_id']);
		$this->assertEquals($userId, $row['user_id']);
	}
}
