<?php
namespace go\modules\legacy\smime;

use go\core\fs\Blob;
use go\core\model\Acl;
use GO\Base\Exception\NotFound;
use GO\Smime\Controller\CertificateController;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../email/fixtures/SharedAccountTrait.php';

/**
 * A PKCS#12 certificate can be uploaded as a JMAP blob (the neo client). Like the file upload, adding it needs write
 * permission on the e-mail account.
 */
class CertificateUploadTest extends TestCase
{
	use \go\modules\legacy\email\SharedAccountTrait;

	private const PASSWORD = 'Cert-pa55';

	private static bool $installedModule = false;

	public static function setUpBeforeClass(): void
	{
		go()->setAuthState(new \go\core\auth\TemporaryState(\go\core\model\User::ID_SUPER_ADMIN));
		\GO::session()->setCurrentUser(\go\core\model\User::ID_SUPER_ADMIN);
		if (\GO::modules()->isInstalled('email') && !\GO::modules()->isInstalled('smime')) {
			\GO\Base\Model\Module::install('smime');
			self::$installedModule = true;
		}
	}

	public static function tearDownAfterClass(): void
	{
		if (self::$installedModule) {
			go()->getDbConnection()->delete('core_module', ['name' => 'smime', 'package' => null])->execute();
			go()->getDbConnection()->exec('DROP TABLE IF EXISTS smi_account_settings, smi_pkcs12, smi_certs');
		}
	}

	protected function setUp(): void
	{
		$this->setUpSharedAccount(Acl::LEVEL_READ);
	}

	protected function tearDown(): void
	{
		if (isset($this->account)) {
			go()->getDbConnection()->delete('smi_pkcs12', ['account_id' => $this->account->id])->execute();
		}
		$this->tearDownSharedAccount();
	}

	/**
	 * A self signed certificate with its private key as PKCS#12, saved as a blob
	 */
	private function createBlob(): Blob
	{
		$config = tempnam(sys_get_temp_dir(), 'smime-cnf');
		file_put_contents($config, "[req]\ndistinguished_name = dn\n[dn]\n");
		try {
			$args = ['config' => $config, 'digest_alg' => 'sha256'];
			$key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
			$csr = openssl_csr_new(['commonName' => 'Upload test', 'emailAddress' => 'upload@example.com'], $key, $args);
			$x509 = openssl_csr_sign($csr, null, $key, 1, $args);
			$this->assertTrue(openssl_pkcs12_export($x509, $p12, $key, self::PASSWORD));
		} finally {
			unlink($config);
		}

		$blob = Blob::fromString($p12);
		$blob->name = 'test.p12';
		$blob->type = 'application/x-pkcs12';
		$this->assertTrue($blob->save(), var_export($blob->getValidationErrors(), true));
		return $blob;
	}

	private function certCount(): int
	{
		return (int) go()->getDbConnection()->selectSingleValue('count(*)')->from('smi_pkcs12')
			->where('account_id', '=', $this->account->id)->single();
	}

	public function testOwnerUploadsCertificateFromBlob(): void
	{
		$blob = $this->createBlob();
		$this->actAs($this->owner->id);

		$result = $this->invoke(new CertificateController(), 'actionUpload', [[
			'account_id' => $this->account->id,
			'smime_password' => self::PASSWORD,
			'blobId' => $blob->id
		]]);

		$this->assertTrue($result['success'], $result['feedback'] ?? '');
		$this->assertSame(1, $this->certCount());
	}

	public function testReadOnlyUserCannotUploadCertificate(): void
	{
		$blob = $this->createBlob();
		$this->actAs($this->other->id);

		$this->assertDenied(new CertificateController(), 'actionUpload', [
			'account_id' => $this->account->id,
			'smime_password' => self::PASSWORD,
			'blobId' => $blob->id
		]);
		$this->assertSame(0, $this->certCount());
	}

	public function testUnknownBlobIsRefused(): void
	{
		$this->actAs($this->owner->id);

		$this->expectException(NotFound::class);
		$this->invoke(new CertificateController(), 'actionUpload', [[
			'account_id' => $this->account->id,
			'smime_password' => self::PASSWORD,
			'blobId' => str_repeat('0', 40)
		]]);
	}
}
