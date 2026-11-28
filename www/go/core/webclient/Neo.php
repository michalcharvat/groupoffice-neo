<?php

namespace go\core\webclient;

use GO;
use go\core\ErrorHandler;
use go\core\fs\File;
use go\core\SingletonTrait;

/**
 * neo.mjs webclient
 *
 * The default webclient, rendered instead of the ExtJS3 Layout.php unless
 * Webclient::current() picks the classic client. The shell lives in views/neo, modules provide
 * their UI in views/neo/Index.mjs.
 *
 * neo resolves its workers, theme CSS and the app relative to the document base
 * and assumes the page sits at apps/<name>/index.html, so the page gets
 * <base href="views/neo/apps/go/">.
 */
class Neo {

	use SingletonTrait;

	/**
	 * Whether this page renders the neo client (see Webclient::current())
	 */
	public static function enabled(): bool
	{
		return Webclient::current() === Webclient::NEO;
	}

	/**
	 * Files of all installed modules that ship a neo UI
	 *
	 * @param string $name file in the module's views/neo folder
	 * @return string[] URLs relative to the web root, cache-busted with the modification time
	 */
	private function moduleFiles(string $name): array
	{
		return $this->cached('neoModuleFiles-' . $name, fn() => $this->findModuleFiles($name));
	}

	/**
	 * Value from the cache unless the debugger is on (dev checkouts see every change at once)
	 *
	 * The key carries the GO and neo.mjs versions and the theme map's mtime, so an upgrade or a
	 * theme build gives new values; module install, enable and upgrade flush the cache like the
	 * ExtJS scripts.
	 */
	private function cached(string $key, callable $fn)
	{
		if (go()->getDebugger()->enabled) {
			return $fn();
		}

		$themeMap = GO::config()->root_path . 'views/neo/resources/theme-map.json';
		$key .= '-' . go()->getVersion() . '-' . $this->neoVersion() . '-' . (is_file($themeMap) ? filemtime($themeMap) : 0);

		$value = go()->getCache()->get($key);
		if ($value === null) {
			$value = $fn();
			go()->getCache()->set($key, $value);
		}
		return $value;
	}

	private function findModuleFiles(string $name): array
	{
		$files = [];
		$rootPath = GO::config()->root_path;
		foreach (GO::modules()->getAllModules(true) as $module) {
			$file = new File($module->moduleManager->path() . 'views/neo/' . $name);
			if ($file->exists()) {
				$files[] = str_replace($rootPath, '', $file->getPath()) . '?v=' . $file->getModifiedAt()->format('U');
			}
		}
		return $files;
	}

	/**
	 * Font Awesome stylesheets of the page: the core's Free copy (views/neo/resources/fontawesome)
	 * unless a module ships views/neo/fontawesome.css, which replaces it (sf/fontawesome: Pro, same
	 * class names), so the page never loads both
	 *
	 * @param string $root url of the GroupOffice root
	 * @return string[] urls
	 */
	private function iconStylesheets(string $root): array
	{
		$replacements = array_map(fn($s) => $root . $s, $this->moduleFiles('fontawesome.css'));
		return $replacements ?: [$root . 'views/neo/resources/fontawesome/css/all.min.css?v=7.3.1'];
	}

	/**
	 * Modules of the logged-in user that have a main panel in the classic client
	 *
	 * The neo shell offers those without a neo main view in its apps menu; they open in the
	 * classic client (docs/neo-switch.md, D3). Lists only enabled modules the logged-in user
	 * may read (module ACL, Module::isAvailableFor()); the classic client checks permissions
	 * again when the module opens.
	 *
	 * @return array[] [['package' => string|null, 'name' => string, 'title' => string, 'route' => string, 'entities' => string[]], ...]
	 */
	public function classicApps(): array
	{
		// a build without the classic client has nothing to launch (and no scripts to scan)
		if (!Webclient::classicAvailable()) {
			return [];
		}

		// scanning the scripts is per installation, the ACL filter per user
		// by module id: modules of different packages may share a name (amd/tasks, community/tasks)
		$panels = $this->cached('neoClassicPanels', function () {
			$panels = [];
			foreach (GO::modules()->getAllModules(true) as $module) {
				$panel = Extjs3::get()->classicMainPanel($module);
				if ($panel !== null) {
					$panels[$module->id] = $panel;
				}
			}
			return $panels;
		});

		// entity types per module id: the classic client opens #<entity>/<id> of its modules
		$entities = [];
		foreach (\go\core\orm\EntityType::findAll() as $type) {
			$entities[$type->getModuleId()][] = $type->getName();
		}

		$userId = go()->getAuthState() ? go()->getAuthState()->getUserId() : null;
		if (!$userId) {
			return [];
		}

		$apps = [];
		foreach (GO::modules()->getAllModules(true) as $module) {
			$panel = $panels[$module->id] ?? null;
			if (!$module->enabled || !$panel) {
				continue;
			}
			// the user's permission on the module (its ACL), at the level the classic panel requires
			if (!\go\core\model\Module::isAvailableFor($module->package ?: 'legacy', $module->name, $userId, $panel['level'])) {
				continue;
			}
			$apps[] = [
				'package' => $module->package ?: null,
				'name' => $module->name,
				'title' => $module->moduleManager->getTitle(),
				'route' => $panel['route'],
				'entities' => $entities[$module->id] ?? []
			];
		}
		return $apps;
	}

	/**
	 * Extra buttons of the login screen (ExtJS: go.login.LoginDialog.addSignInButton()
	 * in a module's App::EVENT_HEAD script). A module's views/neo/login.php returns
	 * [['text' => 'Sign in with X', 'url' => 'api/page.php/...'], ...], url relative to GO.
	 *
	 * @return array[]
	 */
	private function loginButtons(): array
	{
		$buttons = [];
		foreach (GO::modules()->getAllModules(true) as $module) {
			$file = $module->moduleManager->path() . 'views/neo/login.php';
			if (!is_file($file)) {
				continue;
			}
			try {
				$buttons = array_merge($buttons, (array) (static fn() => include $file)());
			} catch (\Throwable $e) {
				\go\core\ErrorHandler::logException($e);
			}
		}
		return array_values(array_filter($buttons, fn($b) => is_array($b) && isset($b['text'], $b['url'])));
	}

	/**
	 * Shared worker name suffix of this page
	 *
	 * A popup (?neoPopup=) must join its opener's worker, which holds the component
	 * it adopts. The opener passes its own build (?neoBuild=): the UI sources may
	 * have changed since the opener loaded, and a fresh buildId() would start a new
	 * worker that knows nothing of the component.
	 */
	private function workerBuild(string $iso): string
	{
		$build = $_GET['neoBuild'] ?? null;
		if ($this->popupId() !== null && is_string($build) && preg_match('/^[\w.-]{1,100}$/', $build)) {
			return $build;
		}
		return $this->buildId() . '-' . $iso;
	}

	private function popupId(): ?string
	{
		$id = $_GET['neoPopup'] ?? null;
		return is_string($id) && preg_match('/^[\w-]{1,100}$/', $id) ? $id : null;
	}

	/**
	 * Build id for the shared worker name
	 *
	 * A SharedWorker lives as long as any GO tab is open, and new tabs connect
	 * to it. Its name carries the GO and neo.mjs versions and the newest mtime of the
	 * neo UI sources and theme map, so a changed UI gets a new worker instead of the old code.
	 * The neo.mjs version is needed because npm installs its files with a fixed mtime.
	 */
	private function buildId(): string
	{
		return $this->cached('neoBuildId', fn() => $this->findBuildId());
	}

	private function findBuildId(): string
	{
		$dirs = [GO::config()->root_path . 'views/neo/apps', GO::config()->root_path . 'views/neo/src'];
		foreach (GO::modules()->getAllModules(true) as $module) {
			$dirs[] = $module->moduleManager->path() . 'views/neo';
		}

		// a theme build adds CSS files the worker only knows from its theme map
		$themeMap = GO::config()->root_path . 'views/neo/resources/theme-map.json';
		$mtime = is_file($themeMap) ? filemtime($themeMap) : 0;
		foreach ($dirs as $dir) {
			if (!is_dir($dir)) {
				continue;
			}
			$it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
			foreach ($it as $file) {
				$mtime = max($mtime, $file->getMTime());
			}
		}
		return go()->getVersion() . '-' . $this->neoVersion() . '-' . $mtime;
	}

	/**
	 * Installed neo.mjs version, from views/neo/node_modules/neo.mjs/package.json
	 *
	 * @return string the version, or "0" when neo.mjs is not installed
	 */
	private function neoVersion(): string
	{
		static $version = null;

		if ($version === null) {
			$file = GO::config()->root_path . 'views/neo/node_modules/neo.mjs/package.json';
			$json = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
			$version = is_array($json) && is_string($json['version'] ?? null) ? $json['version'] : '0';
		}
		return $version;
	}

	/**
	 * All translations of the current language as JSON, served by views/neo/lang.php
	 *
	 * Cached next to the ExtJS language script, so Extjs3::flushCache() (module
	 * install, upgrade) rebuilds it too.
	 */
	public function getLanguageFile(): File
	{
		$iso = go()->getLanguage()->getIsoCode();
		$cacheFile = go()->getDataFolder()->getFile('cache/clientscripts/neo_lang_' . $iso . '.json');

		if (!$cacheFile->exists()) {
			$cacheFile->getFolder()->create();
			$cacheFile->putContents(json_encode(go()->getLanguage()->getAllLanguage()));
		}
		return $cacheFile;
	}

	/**
	 * Languages of the login screen's language menu, like GO.Languages in Extjs3::getLanguageScript()
	 *
	 * @return array [[iso, name], ...]
	 */
	private function languages(): array
	{
		require(\go\core\Environment::get()->getInstallFolder()->getFile('language/languages.php'));

		/** @var array $languages */
		return array_map(fn($code, $name) => [$code, $name], array_keys($languages), $languages);
	}

	/**
	 * The logged-in user's theme as page classes, like MainLayout.js / User.js do in Extjs3:
	 * html.compact for "Compact", body light / dark / system (+ dark by the script for "system")
	 *
	 * @return array{compact: bool, scheme: string}
	 */
	/**
	 * System settings → Appearance like views/Layout.php: the logo and the colours of the
	 * light and dark scheme. The selectors outrank theme-go's token rules (body, body.dark),
	 * which load later; light colours stay out of dark mode as in the classic UI.
	 */
	private function brandingCss(string $root): string
	{
		$settings = go()->getSettings();
		$css = '';

		if ($settings->logoId) {
			// the blob id only busts the cache; rawurlencode() keeps quotes and parentheses out
			$css .= '.neo-theme-go .go-brand, .neo-theme-go .go-login-logo, .neo-theme-go .go-app-launcher-logo { background-image: url(' . $root . 'api/page.php/core/logo?v=' . rawurlencode($settings->logoId) . ') !important; }';
		}

		if ($settings->logoIdDark && go()->getAuthState() && go()->getAuthState()->isAuthenticated()) {
			$css .= '.neo-theme-go.dark .go-brand, .neo-theme-go.dark .go-app-launcher-logo { background-image: url(' . $root . 'api/download.php?blob=' . rawurlencode($settings->logoIdDark) . ') !important; }';
		}

		$light = Page::colorVars($settings, 'Color');
		$dark = Page::colorVars($settings, 'Dark');

		$light && ($css .= 'html body.neo-theme-go:not(.dark) {' . $light . '}');
		$dark && ($css .= 'html body.neo-theme-go.dark {' . $dark . '}');

		return $css;
	}

	private function theme(): array
	{
		$user = go()->getAuthState() && go()->getAuthState()->isAuthenticated()
			? go()->getAuthState()->getUser(['theme', 'themeColorScheme'])
			: null;

		$scheme = $user && in_array($user->themeColorScheme, ['light', 'dark', 'system'], true) ? $user->themeColorScheme : 'light';

		return [
			'compact' => $user && $user->theme === 'Compact',
			'scheme' => $scheme
		];
	}

	public function render(): void
	{
		// a deploy without a GroupOffice version change runs no upgrade, so the page brings the neo tables up to date
		try {
			neo\Schema::migrate();
		} catch (\Throwable $e) {
			ErrorHandler::logException($e, 'neo schema migration');
		}

		$iso = go()->getLanguage()->getIsoCode();
		$build = $this->workerBuild($iso);

		$root = Extjs3::get()->getRelativeUrl();

		$config = [
			'appPath' => '../../apps/go/app.mjs',
			'basePath' => '../../',
			'workerBasePath' => '../../node_modules/neo.mjs/src/worker/',
			'environment' => 'development',
			'themes' => ['neo-theme-go'],
			'useFontAwesome' => false,
			// one App worker for all GO windows: a dialog can move to a popup window
			'useSharedWorkers' => true,
			// Neural Link (docs/neo-neural-link.md): agents drive the App worker over ws://127.0.0.1:8081
			// with the user's session, so its own switch and only on a debug installation
			'useAiClient' => !empty(go()->getConfig()['debug']) && (go()->getConfig()['neuralLink'] ?? false) === true,
			// custom keys, read by the GO shell
			'goBaseUrl' => $root,
			'goModules' => array_map(fn($s) => $root . $s, $this->moduleFiles('Index.mjs')),
			'goTitle' => GO::config()->title,
			'goVersion' => go()->getVersion(),
			// the App worker loads the translations before any view, see src/Translate.mjs
			'goLanguage' => $iso,
			// final unless this is the login screen: the GO_LANGUAGE cookie
			// (?SET_LANGUAGE=) or the logged-in user's language
			'goLanguageFixed' => isset($_COOKIE['GO_LANGUAGE']) || (go()->getAuthState() && go()->getAuthState()->isAuthenticated()),
			'goLanguageUrl' => $root . 'views/neo/lang.php?lang=' . rawurlencode($iso) . '&v=' . $this->getLanguageFile()->getModifiedAt()->format('U'),
			// legacy controllers (index.php?r=..., e.g. files) check it like GO.securityToken in Extjs3.php
			'goSecurityToken' => GO::session()->values['security_token'] ?? null,
			// login screen (go.login.LoginPanel / UsernamePanel): language menu, forgot link, remember box
			'goLanguages' => $this->languages(),
			// My account, Look & feel (GO.lang.holidaySets in Extjs3::getLanguageScript())
			'goHolidaySets' => \go\core\model\Holiday::getHolidaySets(),
			'goLostPasswordUrl' => go()->getSettings()->lostPasswordURL ?: null,
			'goLogoutWhenInactive' => intval(go()->getSettings()->logoutWhenInactive),
			// seconds between popup reminder checks (GO.Checker, src/alerts/Reminders.mjs)
			'goCheckerInterval' => intval(GO::config()->checker_interval),
			// login screen "Sign in with ..." buttons of modules (views/neo/login.php)
			'goLoginButtons' => $this->loginButtons(),
			// set in a popup window opened by GO.view.Dialog: id of the dialog to adopt
			'goPopup' => $this->popupId(),
			// what the Viewport continues with after login: OAuth authorize / consent, the composer of a mailto: link
			'goEntry' => Webclient::neoEntry($_GET) ?: null,
			// the Dev module (component demos) loads only for developers
			// the installation's setting, not the debugger (debug_usernames): the Dev module registers in the shared worker
			'goDebug' => !empty(go()->getConfig()['debug']),
			// avatar menu "Switch to the classic UI" (docs/neo-switch.md D2)
			'goWebclientSwitch' => Webclient::switchAllowed(),
			// shared worker name suffix, passed on to popups (src/Popup.mjs)
			'goBuild' => $build
		];

		$neo = $root . 'views/neo/';
		$theme = $this->theme();
		?><!DOCTYPE html>
<html lang="<?= htmlspecialchars($iso) ?>"<?= $theme['compact'] ? ' class="compact"' : '' ?>>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title><?= htmlspecialchars(GO::config()->title) ?></title>
	<base href="<?= $neo ?>apps/go/">
	<link rel="icon" href="<?= $root ?>favicon.ico">
<?php foreach ($this->iconStylesheets($root) as $css): ?>
	<link rel="stylesheet" href="<?= htmlspecialchars($css) ?>">
<?php endforeach; ?>
<?php foreach ($this->moduleFiles('style.css') as $css): ?>
	<link rel="stylesheet" href="<?= $root . $css ?>">
<?php endforeach; ?>
	<style><?= $this->brandingCss($root) ?></style>
</head>
<body class="<?= $theme['scheme'] ?>">
<script>
	// GO colour scheme "system" follows the OS (go/core/views/extjs3/User.js), src/main/addon/Preferences.mjs
	(() => {
		const query = matchMedia('(prefers-color-scheme: dark)'),
			sync = () => document.body.classList.contains('system') && document.body.classList.toggle('dark', query.matches);
		sync();
		query.addEventListener('change', sync);
	})();
</script>
<script type="module">
	globalThis.Neo = {config: <?= json_encode($config, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) ?>};
	// see buildId(): neo names its shared workers "neomjs-<type>-worker"
	if (globalThis.SharedWorker) {
		// the language too: views translate their labels once, when created
		const build = <?= json_encode($build, JSON_HEX_TAG) ?>;
		globalThis.SharedWorker = class extends globalThis.SharedWorker {
			constructor(url, options = {}) {
				super(url, {...options, name: (options.name || '') + '-' + build});
			}
		};
	}
	import("<?= $neo ?>node_modules/neo.mjs/src/Main.mjs");
	// neo sends "disconnect" on beforeunload only for apps the shared worker has
	// already started; a window that leaves while its app is booting would stay
	// registered (see apps/go/app.mjs): goWindowLeft retires this page's port in the
	// App worker even before its app registered.
	addEventListener('pagehide', () => {
		const manager = globalThis.Neo?.worker?.Manager;
		manager?.windowId && manager.sendMessage('app', {action: 'goWindowLeft', windowId: manager.windowId});
	});
	// the workers have forgotten this window: a page restored from the back/forward cache starts again
	addEventListener('pageshow', e => e.persisted && location.reload());
</script>
</body>
</html>
<?php
	}
}
