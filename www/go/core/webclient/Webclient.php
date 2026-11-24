<?php

namespace go\core\webclient;

use go\core\http\Request;
use go\core\http\Response;

/**
 * Chooses the webclient of a page: neo (default) or the classic ExtJS client
 *
 * Order (docs/neo-switch.md, D2):
 * 1. `?webclient=classic|neo` on the URL: this page only (launchers from neo into classic)
 * 2. cookie GO_WEBCLIENT, set by the explicit switch in the user menu of each client,
 *    ignored when `$config['webclientSwitch']` is false
 * 3. `$config['webclient']` ('extjs3' is an alias of 'classic')
 * 4. neo
 *
 * Queries the neo client doesn't handle yet (OAuth authorize / consent, `?r=&f=` external
 * URLs) always get the classic client.
 *
 * A checkout without the classic client (no views/Extjs3 or views/goui, see
 * classicAvailable()) always gets neo, whatever the URL, cookie or config ask for.
 */
class Webclient {

	public const NEO = 'neo';
	public const CLASSIC = 'classic';
	public const COOKIE = 'GO_WEBCLIENT';

	/**
	 * The webclient of the current page
	 *
	 * @param array|null $query defaults to $_GET
	 * @param array|null $cookies defaults to $_COOKIE
	 * @return string self::NEO or self::CLASSIC
	 */
	public static function current(?array $query = null, ?array $cookies = null): string
	{
		if (!self::classicAvailable()) {
			return self::NEO;
		}

		$query = $query ?? $_GET;
		$cookies = $cookies ?? $_COOKIE;

		if (self::classicOnly($query)) {
			return self::CLASSIC;
		}

		$value = self::valid($query['webclient'] ?? null);
		if ($value) {
			return $value;
		}

		if (self::switchAllowed()) {
			$value = self::valid($cookies[self::COOKIE] ?? null);
			if ($value) {
				return $value;
			}
		}

		return self::configDefault();
	}

	/**
	 * The installation's default client from `$config['webclient']`
	 *
	 * @return string self::NEO or self::CLASSIC
	 */
	public static function configDefault(): string
	{
		$value = go()->getConfig()['webclient'] ?? null;
		if ($value === 'extjs3') {
			return self::CLASSIC;
		}
		return self::valid($value) ?? self::NEO;
	}

	/**
	 * Whether users may switch their browser to the other client (`$config['webclientSwitch']`, default true)
	 *
	 * Never without the classic client (classicAvailable()).
	 */
	public static function switchAllowed(): bool
	{
		return self::classicAvailable() && (go()->getConfig()['webclientSwitch'] ?? true) !== false;
	}

	private static ?bool $classicAvailable = null;

	/**
	 * Whether this installation ships the classic client: the ExtJS 3 views (views/Extjs3) and
	 * the GOUI runtime it embeds (views/goui)
	 *
	 * A build may leave both out (docs/neo-switch.md, section 8). Without them neo is the only
	 * client, nothing may require a file below those folders, and the classic launchers,
	 * the client switch and the classic-only queries are off. Code that would read a file of the
	 * classic client checks this first.
	 */
	public static function classicAvailable(): bool
	{
		if (self::$classicAvailable === null) {
			$root = go()->getEnvironment()->getInstallPath() . '/views/';
			self::$classicAvailable = is_file($root . 'Extjs3/themes/Paper/Layout.php') && is_dir($root . 'goui');
		}
		return self::$classicAvailable;
	}

	/**
	 * Remember the client for this browser
	 *
	 * @param string $client self::NEO or self::CLASSIC
	 * @throws \InvalidArgumentException for any other value
	 */
	public static function setPreference(string $client): void
	{
		if (!self::valid($client)) {
			throw new \InvalidArgumentException("Invalid webclient");
		}

		$_COOKIE[self::COOKIE] = $client;

		// host-only (no domain) and the installation's path: two installations on one host
		// each keep their own choice
		Response::get()->setCookie(self::COOKIE, $client, [
			'expires' => time() + 10 * 365 * 24 * 60 * 60,
			'path' => Extjs3::get()->getRelativeUrl(),
			'samesite' => 'Lax',
			'secure' => Request::get()->isHttps(),
			'httponly' => true
		]);
	}

	/**
	 * Requests the neo client can't continue yet: OAuth login with a pending authorization,
	 * the OAuth consent dialog and legacy external URLs (GO::createExternalUrl())
	 */
	private static function classicOnly(array $query): bool
	{
		return isset($query['oauthAuthorize']) || isset($query['oauthConsent']) || isset($query['f']);
	}

	private static function valid($value): ?string
	{
		return $value === self::NEO || $value === self::CLASSIC ? $value : null;
	}
}
