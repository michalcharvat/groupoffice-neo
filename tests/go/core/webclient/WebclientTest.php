<?php
namespace go\core\webclient;

use go\core\controller\Webclient as WebclientController;
use go\core\exception\Forbidden;
use go\core\jmap\exception\InvalidArguments;
use PHPUnit\Framework\TestCase;

/**
 * Which client a page gets (docs/neo-switch.md, D2) and the guards of the switch
 */
class WebclientTest extends TestCase
{
	private array $config;

	protected function setUp(): void
	{
		$this->config = go()->getConfig();
		// the resolution rules of a build with the classic client, also where it is left out
		self::setClassicAvailable(true);
	}

	protected function tearDown(): void
	{
		go()->setConfig($this->config);
		self::setClassicAvailable(null);
	}

	/**
	 * Pretend a build with or without the classic client (null: detect again)
	 */
	public static function setClassicAvailable(?bool $value): void
	{
		(new \ReflectionProperty(Webclient::class, 'classicAvailable'))->setValue(null, $value);
	}

	private function config(array $values): void
	{
		$config = $this->config;
		unset($config['webclient'], $config['webclientSwitch']);
		go()->setConfig(array_merge($config, $values));
	}

	public static function resolutionProvider(): array
	{
		return [
			'default is neo' => [[], [], [], 'neo'],
			'config classic' => [['webclient' => 'classic'], [], [], 'classic'],
			'config extjs3 alias' => [['webclient' => 'extjs3'], [], [], 'classic'],
			'config invalid' => [['webclient' => 'goui'], [], [], 'neo'],
			'cookie over config' => [['webclient' => 'classic'], [], ['GO_WEBCLIENT' => 'neo'], 'neo'],
			'query over cookie' => [[], ['webclient' => 'classic'], ['GO_WEBCLIENT' => 'neo'], 'classic'],
			'query neo over config' => [['webclient' => 'classic'], ['webclient' => 'neo'], [], 'neo'],
			'invalid query ignored' => [['webclient' => 'classic'], ['webclient' => 'neo2'], [], 'classic'],
			'array query ignored' => [[], ['webclient' => ['classic']], [], 'neo'],
			'extjs3 alias only in config' => [[], ['webclient' => 'extjs3'], ['GO_WEBCLIENT' => 'extjs3'], 'neo'],
			'invalid cookie ignored' => [['webclient' => 'classic'], [], ['GO_WEBCLIENT' => 'x'], 'classic'],
			'switch off ignores cookie' => [['webclientSwitch' => false], [], ['GO_WEBCLIENT' => 'classic'], 'neo'],
			'switch off keeps query' => [['webclientSwitch' => false], ['webclient' => 'classic'], [], 'classic'],
			'oauth authorize in neo' => [[], ['oauthAuthorize' => '1'], [], 'neo'],
			'oauth consent in neo' => [[], ['oauthConsent' => '1'], ['GO_WEBCLIENT' => 'neo'], 'neo'],
			'oauth consent keeps the choice' => [[], ['oauthConsent' => '1'], ['GO_WEBCLIENT' => 'classic'], 'classic'],
			'mailto composer in neo' => [[], ['r' => '', 'f' => self::external('email', 'showComposer', ['values' => ['to' => 'a@example.com']])], [], 'neo'],
			'mailto composer keeps the choice' => [['webclient' => 'classic'], ['r' => '', 'f' => self::external('email', 'showComposer', [])], [], 'classic'],
			'other external url is classic' => [[], ['r' => '', 'f' => self::external('links', 'openModelLink', ['model' => 'x'])], ['GO_WEBCLIENT' => 'neo'], 'classic'],
			'invalid external url is classic' => [[], ['r' => '', 'f' => 'eyJ9'], [], 'classic'],
			'array external url is classic' => [[], ['f' => ['x']], [], 'classic'],
		];
	}

	/**
	 * @dataProvider resolutionProvider
	 */
	public function testCurrent(array $config, array $query, array $cookies, string $expected): void
	{
		$this->config($config);
		$this->assertSame($expected, Webclient::current($query, $cookies));
	}

	public function testSwitchAllowedByDefault(): void
	{
		$this->config([]);
		$this->assertTrue(Webclient::switchAllowed());

		$this->config(['webclientSwitch' => false]);
		$this->assertFalse(Webclient::switchAllowed());
	}

	public function testEndpointRefusedWhenSwitchIsOff(): void
	{
		$this->config(['webclientSwitch' => false]);
		$this->expectException(Forbidden::class);
		(new WebclientController())->setPreference(['client' => 'classic']);
	}

	public function testEndpointRefusesInvalidClient(): void
	{
		$this->config([]);
		$this->expectException(InvalidArguments::class);
		(new WebclientController())->setPreference(['client' => 'extjs3']);
	}

	/**
	 * Without views/Extjs3 and views/goui nothing may pick the classic client: its Layout.php is gone
	 */
	public static function withoutClassicProvider(): array
	{
		return [
			'config classic' => [['webclient' => 'classic'], [], []],
			'config extjs3 alias' => [['webclient' => 'extjs3'], [], []],
			'query classic' => [[], ['webclient' => 'classic'], []],
			'cookie classic' => [[], [], ['GO_WEBCLIENT' => 'classic']],
			'external url' => [[], ['r' => '', 'f' => 'eyJ9'], []],
		];
	}

	/**
	 * @dataProvider withoutClassicProvider
	 */
	public function testWithoutClassicAlwaysNeo(array $config, array $query, array $cookies): void
	{
		$this->config($config);
		// the same request gets classic while the classic client is there
		self::setClassicAvailable(true);
		$this->assertSame('classic', Webclient::current($query, $cookies));

		self::setClassicAvailable(false);
		$this->assertSame('neo', Webclient::current($query, $cookies));
	}

	public function testNoSwitchWithoutClassic(): void
	{
		$this->config(['webclientSwitch' => true]);
		self::setClassicAvailable(false);
		$this->assertFalse(Webclient::switchAllowed());

		$this->expectException(Forbidden::class);
		(new WebclientController())->setPreference(['client' => 'classic']);
	}

	public function testClassicAvailableChecksTheClassicFolders(): void
	{
		self::setClassicAvailable(null);
		$views = go()->getEnvironment()->getInstallPath() . '/views/';
		$this->assertSame(
			is_file($views . 'Extjs3/themes/Paper/Layout.php') && is_dir($views . 'goui'),
			Webclient::classicAvailable()
		);
	}

	public function testPreferenceRefusesInvalidClient(): void
	{
		$this->expectException(\InvalidArgumentException::class);
		Webclient::setPreference('<script>');
	}

	/**
	 * The `f` parameter of GO::createExternalUrl()
	 */
	private static function external(string $module, string $function, $params): string
	{
		return base64_encode(json_encode(['m' => $module, 'f' => $function, 'p' => $params]));
	}

	public function testExternalCommand(): void
	{
		$this->assertSame(
			['m' => 'links', 'f' => 'openModelLink', 'p' => ['model' => 'x', 'id' => 1]],
			Webclient::externalCommand(self::external('links', 'openModelLink', ['model' => 'x', 'id' => 1]))
		);
	}

	/**
	 * Both clients get only the mail fields of a composer link: the classic client passes `p` to GO.email.showComposer()
	 */
	public function testExternalComposerCommandKeepsOnlyMailFields(): void
	{
		$command = Webclient::externalCommand(self::external('email', 'showComposer', [
			'values' => ['to' => 'a@example.com', 'body' => '<b>x</b>', 'extra' => 'y'],
			'loadUrl' => 'email/message/openDraft',
			'loadParams' => ['uid' => 1]
		]));

		$this->assertSame(['values' => [
			'to' => 'a@example.com',
			'cc' => '',
			'bcc' => '',
			'subject' => '',
			'body' => '&lt;b&gt;x&lt;/b&gt;'
		]], $command['p']);
	}

	public static function invalidExternalCommandProvider(): array
	{
		return [
			'not a string' => [['x']],
			'empty' => [''],
			'not json' => [base64_encode('nope')],
			'no function' => [base64_encode(json_encode(['m' => 'email']))],
			// the classic client calls GO.<m>.<f>() with them
			'script in module' => [self::external('email;alert(1)//', 'showComposer', [])],
			'script in function' => [self::external('email', 'x(1);y', [])],
			'array module' => [base64_encode(json_encode(['m' => ['email'], 'f' => 'showComposer']))],
		];
	}

	/**
	 * @dataProvider invalidExternalCommandProvider
	 */
	public function testInvalidExternalCommand($f): void
	{
		$this->assertNull(Webclient::externalCommand($f));
	}

	public function testNeoEntryOauth(): void
	{
		$this->assertSame(['oauth' => 'authorize'], Webclient::neoEntry(['oauthAuthorize' => '1']));
		$this->assertSame(['oauth' => 'consent'], Webclient::neoEntry(['oauthConsent' => '1']));
		$this->assertSame([], Webclient::neoEntry([]));
		$this->assertSame([], Webclient::neoEntry(['f' => self::external('links', 'openModelLink', [])]));
	}

	public function testNeoEntryMailtoComposer(): void
	{
		// what email/message/mailto (MessageController::actionMailto()) redirects to
		$entry = Webclient::neoEntry(['r' => '', 'f' => self::external('email', 'showComposer', ['values' => [
			'to' => 'a@example.com',
			'cc' => ['not', 'a', 'string'],
			'subject' => 'Hello <b>you</b>',
			'body' => nl2br("Line 1\n<img src=x onerror=alert(1)>\nA <br /> in the text & more")
		]])]);

		$this->assertSame([
			'to' => 'a@example.com',
			'cc' => '',
			'bcc' => '',
			// text: the composer puts it in a text field
			'subject' => 'Hello <b>you</b>',
			// HTML: no markup of the link survives, only its line breaks
			'body' => "Line 1<br />\n&lt;img src=x onerror=alert(1)&gt;<br />\nA &lt;br /&gt; in the text &amp; more"
		], $entry['compose']);
	}

	public function testNeoEntryComposerWithoutValues(): void
	{
		$this->assertSame(
			['to' => '', 'cc' => '', 'bcc' => '', 'subject' => '', 'body' => ''],
			Webclient::neoEntry(['f' => self::external('email', 'showComposer', 'x')])['compose']
		);
	}
}
