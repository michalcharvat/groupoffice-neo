<?php
namespace go\modules\community\syncfusion\controller;

use GO\Base\Model\Acl;
use GO\Files\Model\File;
use GO\Files\Model\Folder;
use go\core\auth\TemporaryState;
use go\core\fs\Blob;
use go\core\model\User;
use go\modules\community\syncfusion\model\Settings;
use PHPUnit\Framework\TestCase;

/**
 * The editor opens a Files module file only with read permission and saves it back only with write permission
 * (doc, dotx and rtf: a new .docx needs write permission on the folder). None of these tests reach the conversion
 * service: the guards answer first.
 */
class EditorTest extends TestCase
{
	private static $authState;
	private static bool $ignoreAcl;
	private static bool $disableModelCache;
	private static ?int $createdModuleId = null;
	private static User $owner;
	private static User $reader;
	private static User $stranger;
	private static Folder $ownerFolder;

	private ?File $file = null;

	public static function setUpBeforeClass(): void
	{
		self::$authState = go()->getAuthState();
		self::$ignoreAcl = \GO::$ignoreAclPermissions;
		self::$disableModelCache = \GO::$disableModelCache;

		try {
			// The module is not installed by the test bootstrap: its settings need a module record
			$db = go()->getDbConnection();
			$exists = $db->selectSingleValue('id')->from('core_module')
				->where(['package' => 'community', 'name' => 'syncfusion'])->single();
			if (!$exists) {
				$db->insert('core_module', ['name' => 'syncfusion', 'package' => 'community', 'version' => 0, 'enabled' => 1])->execute();
				self::$createdModuleId = (int) $db->getPDO()->lastInsertId();
				// like Module::beforeInstall(): Internal users may use the module
				$db->insert('core_permission', ['moduleId' => self::$createdModuleId, 'groupId' => \go\core\model\Group::ID_INTERNAL, 'rights' => 1])->execute();
			}

			\GO::$ignoreAclPermissions = false;
			// cached models keep the permission level of the user that loaded them
			\GO::$disableModelCache = true;

			self::$owner = self::createUser('sfowner');
			self::$reader = self::createUser('sfreader');
			self::$stranger = self::createUser('sfstranger');

			self::actAs(self::$owner->id);
			self::$ownerFolder = Folder::model()->findHomeFolder(\GO\Base\Model\User::model()->findByPk(self::$owner->id));

			\GO::$ignoreAclPermissions = true;
			Acl::model()->findByPk(self::$ownerFolder->acl_id)->addGroup(self::$reader->getPersonalGroup()->id, Acl::READ_PERMISSION);
			\GO::$ignoreAclPermissions = false;
		} catch (\Throwable $e) {
			// tearDownAfterClass() isn't called when this fails
			self::tearDownAfterClass();
			throw $e;
		}
	}

	public static function tearDownAfterClass(): void
	{
		self::actAs(User::ID_SUPER_ADMIN);
		\GO::$ignoreAclPermissions = true;

		if (isset(self::$ownerFolder)) {
			self::$ownerFolder->delete(true);
		}

		$ids = [];
		foreach (['owner', 'reader', 'stranger'] as $prop) {
			if (isset(self::$$prop)) {
				$home = Folder::model()->findByPath('users/' . self::$$prop->username);
				if ($home && $prop !== 'owner') {
					$home->delete(true);
				}
				$ids[] = self::$$prop->id;
			}
		}
		if ($ids) {
			User::delete(['id' => $ids]);
		}

		if (self::$createdModuleId) {
			go()->getDbConnection()->delete('core_permission', ['moduleId' => self::$createdModuleId])->execute();
			go()->getDbConnection()->delete('core_module', ['id' => self::$createdModuleId])->execute();
			self::$createdModuleId = null;
		}
		Settings::flushCache();

		\GO::$ignoreAclPermissions = self::$ignoreAcl;
		\GO::$disableModelCache = self::$disableModelCache;
		go()->setAuthState(self::$authState);
	}

	protected function setUp(): void
	{
		// openDocument() needs a configured service before it looks at the file; it is never called
		Settings::get()->documentServiceUrl = 'http://127.0.0.1:9/api/documenteditor';
	}

	protected function tearDown(): void
	{
		if ($this->file) {
			self::actAs(User::ID_SUPER_ADMIN);
			\GO::$ignoreAclPermissions = true;
			$this->file->delete(true);
			$docx = File::model()->findByPath(self::$ownerFolder->path . '/test.docx');
			if ($docx) {
				$docx->delete(true);
			}
			\GO::$ignoreAclPermissions = false;
			$this->file = null;
		}
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
			throw new \Exception(var_export($user->getValidationErrors(), true));
		}
		return $user;
	}

	private static function actAs(int $userId): void
	{
		go()->setAuthState(new TemporaryState($userId));
		\GO::session()->setCurrentUser($userId);
	}

	/**
	 * A file of the owner in the owner's home folder
	 */
	private function createFile(string $name, string $content): File
	{
		self::actAs(self::$owner->id);
		$tmp = \GO\Base\Fs\File::tempFile('', pathinfo($name, PATHINFO_EXTENSION));
		$tmp->putContents($content);
		$this->file = self::$ownerFolder->addFilesystemFile($tmp, true, $name);
		$this->assertNotFalse($this->file);
		return $this->file;
	}

	private function createBlob(string $content): Blob
	{
		$blob = Blob::fromString($content);
		$blob->name = 'edited.txt';
		$blob->type = 'text/plain';
		$this->assertTrue($blob->save(), var_export($blob->getValidationErrors(), true));
		return $blob;
	}

	/**
	 * The call is refused: the legacy ActiveRecord throws AccessDenied when it loads a file or folder the user can't
	 * read, the controller answers with an error for the other cases
	 */
	private function assertDenied(callable $call, string $error): void
	{
		try {
			$result = $call();
		} catch (\GO\Base\Exception\AccessDenied $e) {
			$this->addToAssertionCount(1);
			return;
		}
		$this->assertFalse($result['success']);
		$this->assertSame($error, $result['error']);
	}

	public function testOpenNeedsReadPermission(): void
	{
		$file = $this->createFile('test.txt', 'original');

		self::actAs(self::$stranger->id);
		$this->assertDenied(fn() => (new Editor())->openDocument(['fileId' => $file->id]), 'File not found or access denied.');
	}

	public function testSaveNeedsWritePermission(): void
	{
		$file = $this->createFile('test.txt', 'original');
		$blob = $this->createBlob('changed');

		foreach ([self::$reader, self::$stranger] as $user) {
			self::actAs($user->id);
			$this->assertDenied(fn() => (new Editor())->save(['fileId' => $file->id, 'blobId' => $blob->id]), 'Access denied.');
		}
		$this->assertSame('original', $file->fsFile->getContents());
	}

	public function testSaveAsNewDocxNeedsWritePermissionOnTheFolder(): void
	{
		$file = $this->createFile('test.rtf', '{\\rtf1 original}');
		$blob = $this->createBlob('docx content');

		foreach ([self::$reader, self::$stranger] as $user) {
			self::actAs($user->id);
			$this->assertDenied(fn() => (new Editor())->save(['fileId' => $file->id, 'blobId' => $blob->id]), 'Access denied.');
		}
		$this->assertFileDoesNotExist(self::$ownerFolder->fsFolder->path() . '/test.docx');
	}

	public function testLockedDocumentIsNotSavedAsNewDocx(): void
	{
		$file = $this->createFile('test.rtf', '{\\rtf1 original}');
		$blob = $this->createBlob('docx content');

		// locked by another user
		\GO::$ignoreAclPermissions = true;
		$file->locked_user_id = self::$reader->id;
		$file->lock_expires_at = time() + 3600;
		$this->assertTrue($file->save());
		\GO::$ignoreAclPermissions = false;

		self::actAs(self::$owner->id);
		$result = (new Editor())->save(['fileId' => $file->id, 'blobId' => $blob->id]);

		$this->assertFalse($result['success']);
		$this->assertSame('File is locked.', $result['error']);
		$this->assertFileDoesNotExist(self::$ownerFolder->fsFolder->path() . '/test.docx');
	}

	public function testOwnerSavesANewVersion(): void
	{
		$file = $this->createFile('test.txt', 'original');
		$blob = $this->createBlob('changed');

		self::actAs(self::$owner->id);
		$result = (new Editor())->save(['fileId' => $file->id, 'blobId' => $blob->id]);

		$this->assertTrue($result['success'], $result['error'] ?? '');
		$this->assertSame('changed', File::model()->findByPk($file->id)->fsFile->getContents());
		$this->assertSame(1, (int) \GO\Files\Model\Version::model()->count(
			(new \GO\Base\Db\FindParams())->criteria(\GO\Base\Db\FindCriteria::newInstance()->addCondition('file_id', $file->id))
		));
	}
}
