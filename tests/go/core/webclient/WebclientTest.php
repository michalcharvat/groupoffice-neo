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
	}

	protected function tearDown(): void
	{
		go()->setConfig($this->config);
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
			'oauth authorize is classic' => [[], ['oauthAuthorize' => '1', 'webclient' => 'neo'], [], 'classic'],
			'oauth consent is classic' => [[], ['oauthConsent' => '1'], ['GO_WEBCLIENT' => 'neo'], 'classic'],
			'external url is classic' => [[], ['r' => '', 'f' => 'eyJ9'], [], 'classic'],
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

	public function testPreferenceRefusesInvalidClient(): void
	{
		$this->expectException(\InvalidArgumentException::class);
		Webclient::setPreference('<script>');
	}
}
