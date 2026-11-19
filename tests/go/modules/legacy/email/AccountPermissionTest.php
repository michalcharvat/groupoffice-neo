<?php

namespace go\modules\legacy\email;

use GO\Email\Controller\AccountController;
use GO\Email\Controller\AliasController;
use GO\Email\Model\Account;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/fixtures/SharedAccountTrait.php';

/**
 * A user who may use a shared e-mail account ("Use account") may not change its settings, password, aliases or
 * filters, or delete it. That requires manage permission. The account dialog of the neo client uses these routes.
 */
class AccountPermissionTest extends TestCase
{
	use SharedAccountTrait;

	protected function setUp(): void
	{
		$this->setUpSharedAccount(\go\core\model\Acl::LEVEL_CREATE);
	}

	protected function tearDown(): void
	{
		$this->tearDownSharedAccount();
	}

	public function testUserCannotChangeSomeoneElsesAccount(): void
	{
		$this->actAs($this->other->id);
		$this->assertDenied(new AccountController(), 'actionSubmit', ['id' => $this->account->id, 'host' => 'evil.example.com']);
		$this->assertSame('127.0.0.1', $this->reloadAccount()->host);
	}

	public function testUserCannotChangeThePasswordOfSomeoneElsesAccount(): void
	{
		$this->actAs($this->other->id);
		$this->assertDenied(new AccountController(), 'actionSavePassword', ['id' => $this->account->id, 'password' => 'changed']);
		$this->assertSame('secret', $this->reloadAccount()->decryptPassword());
	}

	public function testUserCannotDeleteSomeoneElsesAccount(): void
	{
		$this->actAs($this->other->id);
		$this->assertDenied(new AccountController(), 'actionDelete', ['id' => $this->account->id]);
		$this->assertNotNull($this->reloadAccount());
	}

	public function testUserCannotChangeTheAliasOfSomeoneElsesAccount(): void
	{
		$alias = $this->account->getDefaultAlias();

		$this->actAs($this->other->id);
		$this->assertDenied(new AliasController(), 'actionSubmit', ['id' => $alias->id, 'email' => 'evil@example.com', 'signature' => 'evil']);

		\GO::$ignoreAclPermissions = true;
		$this->assertSame($this->owner->email, \GO\Email\Model\Alias::model()->findByPk($alias->id, false, true)->email);
		\GO::$ignoreAclPermissions = false;
	}

	public function testOwnerCanChangeTheirAccount(): void
	{
		$this->actAs($this->owner->id);
		$this->assertAllowed(new AccountController(), 'actionSubmit', ['id' => $this->account->id, 'name' => 'Owner']);
	}

	public function testClientSettingsHideAddingAccountsFromUsersWithoutModuleWrite(): void
	{
		$this->actAs($this->other->id);
		$response = $this->invoke(new AccountController(), 'actionClientSettings', []);
		$this->assertTrue($response['success']);
		$this->assertFalse($response['data']['module_write']);

		$this->actAs(\go\core\model\User::ID_SUPER_ADMIN);
		$response = $this->invoke(new AccountController(), 'actionClientSettings', []);
		$this->assertTrue($response['data']['module_write']);
	}

	public function testTreeReportsAFailedImapLogin(): void
	{
		// a server that refuses every login: the client asks for a new password
		$server = $this->startRefusingImapServer($port);
		try {
			\GO::$ignoreAclPermissions = true;
			go()->getDbConnection()->update('em_accounts', ['port' => $port], ['id' => $this->account->id])->execute();
			\GO::$ignoreAclPermissions = false;

			$this->actAs($this->owner->id);
			$response = $this->invoke(new AccountController(), 'actionTree', [['node' => base64_encode('account_' . $this->account->id)]]);
			$this->assertFalse($response['success']);
			$this->assertTrue($response['imapAuthFailed']);
			$this->assertSame(\GO\Base\Mail\Exception\ImapAuthenticationFailedException::class, $response['exceptionClass']);
		} finally {
			proc_terminate($server);
			proc_close($server);
		}
	}

	private function reloadAccount(): ?Account
	{
		\GO::$ignoreAclPermissions = true;
		try {
			return Account::model()->findByPk($this->account->id, false, true);
		} finally {
			\GO::$ignoreAclPermissions = false;
		}
	}

	/**
	 * Starts an IMAP server on a free local port that answers every LOGIN with NO
	 *
	 * @return resource the process
	 */
	private function startRefusingImapServer(?int &$port)
	{
		$socket = stream_socket_server('tcp://127.0.0.1:0');
		$port = (int) substr(strrchr(stream_socket_get_name($socket, false), ':'), 1);
		fclose($socket);

		$script = '$s = stream_socket_server("tcp://127.0.0.1:' . $port . '");'
			. 'while ($c = @stream_socket_accept($s, 30)) {'
			. 'fwrite($c, "* OK IMAP4rev1 ready\r\n");'
			. 'while (($l = fgets($c)) !== false) {'
			. '$tag = strtok($l, " "); $cmd = strtoupper(trim((string) strtok(" ")));'
			. 'if ($cmd === "CAPABILITY") { fwrite($c, "* CAPABILITY IMAP4rev1\r\n$tag OK done\r\n"); }'
			. 'elseif ($cmd === "LOGOUT") { fwrite($c, "* BYE\r\n$tag OK bye\r\n"); break; }'
			. 'else { fwrite($c, "$tag NO [AUTHENTICATIONFAILED] Authentication failed.\r\n"); }'
			. '} fclose($c); }';

		$process = proc_open([PHP_BINARY, '-r', $script], [], $pipes);
		$this->assertIsResource($process);

		// wait until it listens
		for ($i = 0; $i < 50; $i++) {
			$probe = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.1);
			if ($probe) {
				fclose($probe);
				break;
			}
			usleep(50000);
		}
		return $process;
	}
}
