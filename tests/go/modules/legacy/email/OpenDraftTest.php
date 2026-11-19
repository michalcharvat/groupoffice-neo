<?php

namespace go\modules\legacy\email;

use GO\Email\Controller\MessageController;
use PHPUnit\Framework\TestCase;

/**
 * email/message/openDraft opens drafts and sent items in the composer. Send and save delete the returned draft_uid
 * from the Drafts folder, so only a message of the Drafts folder may return its UID: a sent message's UID would
 * delete an unrelated draft.
 */
class OpenDraftTest extends TestCase
{
	public static function folders(): array
	{
		return [
			'draft' => ['Drafts', 'Drafts', 12, 12],
			'nested drafts folder' => ['INBOX.Drafts', 'INBOX.Drafts', 7, 7],
			'sent item' => ['Sent', 'Drafts', 12, 0],
			'other folder with the same name part' => ['INBOX.Drafts.old', 'INBOX.Drafts', 3, 0],
			'account without drafts folder' => ['Drafts', '', 5, 0],
			'drafts folder not set' => ['Drafts', null, 5, 0]
		];
	}

	/**
	 * @dataProvider folders
	 */
	public function testOnlyDraftsReplaceThemselves(string $mailbox, ?string $draftsFolder, int $uid, int $expected): void
	{
		$this->assertSame($expected, MessageController::draftUid($mailbox, $draftsFolder, $uid));
	}
}
