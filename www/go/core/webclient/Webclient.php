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
	 */
	public static function switchAllowed(): bool
	{
		return (go()->getConfig()['webclientSwitch'] ?? true) !== false;
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

		// host-only (no domain), like a browser preference should be
		Response::get()->setCookie(self::COOKIE, $client, [
			'expires' => time() + 10 * 365 * 24 * 60 * 60,
			'path' => '/',
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
