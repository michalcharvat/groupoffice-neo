<?php

namespace go\core\webclient;

use go\core\Installer;
use Throwable;

/**
 * Layout of the standalone pages: installer and upgrade, the maintenance, licence and
 * "security warning" screens, error pages, the calendar invitation (RSVP) page and module
 * pages such as the OAuth 2 client's success page
 *
 * Neutral code: it needs neither the classic client (views/Extjs3, views/goui) nor a logged-in
 * user or a working database. It links the standalone stylesheet of the neo client
 * (views/neo/dist/page.css, built from the neo theme tokens with the neo themes, light and
 * dark) and the colours and logo of System settings → Appearance.
 *
 * ```
 * Page::header(go()->t("Error"));
 * echo '<section><fieldset><h1>…</h1><p>…</p></fieldset></section>';
 * Page::footer();
 * ```
 *
 * The page content goes in `<section>` elements; a `<fieldset>` or `.card` in a section is a
 * card. Buttons: `<button class="primary">` or `<a class="button primary">`.
 */
class Page {

	/**
	 * Print the document head and the page header
	 *
	 * @param string|null $title shown after the product name in the window title
	 * @param string $bodyCls extra classes of the body element
	 * @param string $head extra HTML for the head (e.g. a <style> block)
	 */
	public static function header(?string $title = null, string $bodyCls = '', string $head = ''): void
	{
		$root = Extjs3::get()->getRelativeUrl();
		$iso = self::safe(fn() => go()->getLanguage()->getIsoCode(), 'en');
		$dir = self::safe(fn() => go()->getLanguage()->getTextDirection(), 'ltr');
		$product = self::safe(fn() => Installer::isInstalling() ? go()->t("Installation") : go()->getSettings()->title, 'GroupOffice');
		$css = self::stylesheet();
		$scheme = self::colorScheme();
		?><!DOCTYPE html>
<html lang="<?= htmlspecialchars($iso) ?>" dir="<?= htmlspecialchars($dir) ?>">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
	<meta name="robots" content="noindex">
	<title><?= htmlspecialchars($product . (isset($title) ? ' - ' . $title : '')) ?></title>
	<link rel="icon" href="<?= htmlspecialchars(self::safe(fn() => go()->getConfig()['favicon'] ?? '', '') ?: $root . 'favicon.ico') ?>">
	<link rel="stylesheet" href="<?= $root . $css ?>">
	<style><?= self::brandingCss($root) ?></style>
	<?= $head ?>
</head>
<body class="go-page <?= $scheme ?><?= $bodyCls !== '' ? ' ' . htmlspecialchars($bodyCls) : '' ?>">
<script>
	// colour scheme "system" follows the OS, like the neo client (Neo::render())
	(() => {
		const query = matchMedia('(prefers-color-scheme: dark)'),
			sync = () => document.body.classList.contains('system') && document.body.classList.toggle('dark', query.matches);
		sync();
		query.addEventListener('change', sync);
	})();
</script>
<header>
	<div class="go-app-logo"></div>
</header>
<main>
<?php
	}

	/**
	 * Print the page footer and close the document
	 */
	public static function footer(): void
	{
		?>
</main>
<footer>&copy; Intermesh - <a href="https://www.group-office.com">https://www.group-office.com</a></footer>
</body>
</html>
<?php
	}

	/**
	 * Print a whole page
	 *
	 * @param string $html the content (HTML, not escaped)
	 * @param string|null $title shown after the product name in the window title
	 */
	public static function render(string $html, ?string $title = null): void
	{
		self::header($title);
		echo $html;
		self::footer();
	}

	/**
	 * The standalone stylesheet, relative to the installation's URL, cache-busted with its mtime
	 */
	public static function stylesheet(): string
	{
		$path = 'views/neo/dist/page.css';
		$file = go()->getEnvironment()->getInstallPath() . '/' . $path;
		return $path . (is_file($file) ? '?v=' . filemtime($file) : '');
	}

	/**
	 * System settings → Appearance colours as CSS custom properties, valid colours only
	 * (6 hex digits): a setting must never add CSS of its own
	 *
	 * @param object $settings go\core\model\Settings
	 * @param string $theme 'Color' (light) or 'Dark'
	 * @return string declarations, e.g. "--fg-main: #1652a1;…"
	 */
	public static function colorVars(object $settings, string $theme): string
	{
		$css = '';

		foreach (['--fg-main' => 'primary', '--c-primary' => 'secondary', '--c-secondary' => 'tertiary', '--c-accent' => 'accent'] as $var => $type) {
			$value = (string) $settings->{$type . $theme};

			if (preg_match('/^[0-9a-f]{6}$/i', $value)) {
				$css .= $var . ': #' . $value . ';';

				if ($type === 'primary') {
					$css .= '--fg-main-tp: rgba(' . implode(', ', array_map('hexdec', str_split($value, 2))) . ', .16);';
				}
			}
		}

		return $css;
	}

	/**
	 * Logo and colours of System settings → Appearance; nothing while installing or when the
	 * settings can't be read (a page about a broken database)
	 */
	private static function brandingCss(string $root): string
	{
		return self::safe(function () use ($root) {
			if (Installer::isInstalling()) {
				return '';
			}

			$settings = go()->getSettings();
			$css = '';

			if ($settings->logoId) {
				// the blob id only busts the cache; rawurlencode() keeps quotes and parentheses out
				$css .= '.go-page .go-app-logo { background-image: url(' . $root . 'api/page.php/core/logo?v=' . rawurlencode($settings->logoId) . '); }';
			}

			$light = self::colorVars($settings, 'Color');
			$dark = self::colorVars($settings, 'Dark');

			$light && ($css .= 'html body.go-page:not(.dark) {' . $light . '}');
			$dark && ($css .= 'html body.go-page.dark {' . $dark . '}');

			return $css;
		}, '');
	}

	/**
	 * The logged-in user's colour scheme (light, dark or system), else the OS's ("system")
	 */
	private static function colorScheme(): string
	{
		return self::safe(function () {
			$state = go()->getAuthState();
			if (Installer::isInstalling() || !$state || !$state->isAuthenticated()) {
				return 'system';
			}
			$scheme = $state->getUser(['themeColorScheme'])->themeColorScheme ?? null;
			return in_array($scheme, ['light', 'dark', 'system'], true) ? $scheme : 'light';
		}, 'system');
	}

	/**
	 * The value of $fn, or $default when it throws: the page also reports a broken installation
	 */
	private static function safe(callable $fn, $default)
	{
		try {
			return $fn();
		} catch (Throwable $e) {
			return $default;
		}
	}
}
