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
 * `?r=&f=` external URLs (GO::createExternalUrl()) with a command the neo client doesn't handle
 * (see neoEntry()) always get the classic client. OAuth authorize / consent continue in both.
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
	 * Requests the neo client can't continue yet: legacy external URLs (GO::createExternalUrl())
	 * with a command neoEntry() doesn't map
	 */
	private static function classicOnly(array $query): bool
	{
		return isset($query['f']) && !isset(self::neoEntry($query)['compose']);
	}

	/**
	 * The command of a legacy external URL: `?r=&f=<base64 JSON>` (GO::createExternalUrl())
	 *
	 * @param mixed $f the `f` query parameter
	 * @return array{m: string, f: string, p: mixed}|null null when missing or invalid: the module and
	 *     function names may only hold letters (the classic client calls `GO.<m>.<f>()` with them).
	 *     The parameters of `email.showComposer` are reduced to the mail fields, see composerValues().
	 */
	public static function externalCommand($f): ?array
	{
		if (!is_string($f) || $f === '') {
			return null;
		}

		$command = json_decode((string) base64_decode($f), true);

		if (!is_array($command) || !is_string($command['m'] ?? null) || !is_string($command['f'] ?? null)
			|| !preg_match('/^[a-z_]+$/', $command['m']) || !preg_match('/^[a-z]+$/i', $command['f'])) {
			return null;
		}

		$params = $command['p'] ?? null;
		if ($command['m'] === 'email' && $command['f'] === 'showComposer') {
			// anyone can build such a link: only the fields of a mail link, never composer options like loadUrl
			$params = ['values' => self::composerValues(is_array($params) && is_array($params['values'] ?? null) ? $params['values'] : [])];
		}

		return ['m' => $command['m'], 'f' => $command['f'], 'p' => $params];
	}

	/**
	 * The composer fields of a mail link: to, cc, bcc and subject as text, body as HTML made from the link's text
	 *
	 * MessageController::actionMailto() puts the link's text through nl2br(). Only those line breaks are taken out
	 * again, then the text is escaped: a link can't put markup into the composer.
	 *
	 * @param array $values the `values` of an `email.showComposer` external URL
	 * @return array{to: string, cc: string, bcc: string, subject: string, body: string}
	 */
	private static function composerValues(array $values): array
	{
		$compose = [];
		foreach (['to', 'cc', 'bcc', 'subject', 'body'] as $name) {
			$value = $values[$name] ?? '';
			$compose[$name] = is_string($value) ? $value : '';
		}
		$text = preg_replace('#<br />(?=\r\n|\n|\r)#', '', $compose['body']);
		$compose['body'] = nl2br(htmlspecialchars($text, ENT_QUOTES, 'UTF-8'));
		return $compose;
	}

	/**
	 * What the neo client continues with after login, from the page's query (docs/neo-switch.md, D5)
	 *
	 * - `oauth`: 'authorize' (`?oauthAuthorize=1`, api/oauth.php sent the user to the login with a pending
	 *   authorization) or 'consent' (`?oauthConsent=1`, the user must approve a self-registered client)
	 * - `compose`: the e-mail composer of a mailto: link (`email/message/mailto` redirects to the external URL
	 *   `email.showComposer`), see composerValues()
	 *
	 * @param array $query the page's $_GET
	 * @return array{oauth?: string, compose?: array<string, string>}
	 */
	public static function neoEntry(array $query): array
	{
		$entry = [];

		if (isset($query['oauthAuthorize'])) {
			$entry['oauth'] = 'authorize';
		} elseif (isset($query['oauthConsent'])) {
			$entry['oauth'] = 'consent';
		}

		$command = self::externalCommand($query['f'] ?? null);
		if ($command && $command['m'] === 'email' && $command['f'] === 'showComposer') {
			$entry['compose'] = $command['p']['values'];
		}

		return $entry;
	}

	private static function valid($value): ?string
	{
		return $value === self::NEO || $value === self::CLASSIC ? $value : null;
	}
}
