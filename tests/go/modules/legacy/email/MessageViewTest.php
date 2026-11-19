<?php

namespace go\modules\legacy\email;

use GO\Base\Model\Acl;
use GO\Email\Controller\MessageController;
use GO\Email\Model\Account;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/fixtures/SharedAccountTrait.php';

/**
 * email/message/view tells the client the user's permission level on the account and the "always respond to read
 * notifications" setting: the neo message view shows its actions from them, also in a window without the account
 * tree. The IMAP server replays a recorded session of a plain text message that asks for a read notification.
 */
class MessageViewTest extends TestCase
{
	use SharedAccountTrait;

	private $process;
	private $pipes;
	private string $logFile;

	private function startServer(): void
	{
		$this->logFile = tempnam(sys_get_temp_dir(), 'replayimap');
		$this->process = proc_open(
			[PHP_BINARY, __DIR__ . '/fixtures/replay-imap-server.php', __DIR__ . '/fixtures/view-message.imap.json', $this->logFile],
			[0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
			$this->pipes
		);
		$port = (int) fgets($this->pipes[1]);
		$this->assertGreaterThan(0, $port, 'The replay IMAP server did not start');

		$this->actAs(\go\core\model\User::ID_SUPER_ADMIN);
		$account = Account::model()->findByPk($this->account->id, false, true);
		$account->port = $port;
		$account->checkImapConnectionOnSave = false;
		$this->assertTrue($account->save(true));
	}

	protected function tearDown(): void
	{
		if (isset($this->process)) {
			fclose($this->pipes[0]);
			proc_terminate($this->process);
			proc_close($this->process);
			unlink($this->logFile);
		}
		if (isset($this->other)) {
			\GO::config()->delete_setting('email_always_respond_to_notifications', $this->other->id);
		}
		$this->tearDownSharedAccount();
	}

	private function view(): array
	{
		$this->actAs($this->other->id);
		return $this->invoke(new MessageController(), 'actionView', [['account_id' => $this->account->id, 'mailbox' => 'UnitTest', 'uid' => 1]]);
	}

	public static function levels(): array
	{
		return [
			'read only' => [Acl::READ_PERMISSION],
			'delegated' => [Account::ACL_DELEGATED_PERMISSION],
			'use account' => [Acl::CREATE_PERMISSION],
		];
	}

	#[DataProvider('levels')]
	public function testViewReturnsPermissionLevel(int $level): void
	{
		$this->setUpSharedAccount($level);
		$this->startServer();

		$response = $this->view();

		$this->assertSame('Read receipt test', $response['subject']);
		$this->assertSame('rita@example.com', $response['notification']);
		$this->assertSame($level, $response['permission_level']);
		$this->assertFalse($response['always_respond_to_notifications']);
	}

	public function testViewReturnsAlwaysRespondSetting(): void
	{
		$this->setUpSharedAccount(Acl::CREATE_PERMISSION);
		$this->startServer();
		\GO::config()->save_setting('email_always_respond_to_notifications', '1', $this->other->id);

		$this->assertTrue($this->view()['always_respond_to_notifications']);

		// the setting of another user does not count
		\GO::config()->delete_setting('email_always_respond_to_notifications', $this->other->id);
		\GO::config()->save_setting('email_always_respond_to_notifications', '1', $this->owner->id);
		try {
			$this->assertFalse($this->view()['always_respond_to_notifications']);
		} finally {
			\GO::config()->delete_setting('email_always_respond_to_notifications', $this->owner->id);
		}
	}
}
