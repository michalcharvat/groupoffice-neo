<?php

namespace go\core\webclient;

use GO;
use go\core\fs\File;
use go\core\SingletonTrait;

/**
 * neo.mjs webclient (spike)
 *
 * Rendered instead of the ExtJS3 Layout.php when config.php sets
 * $config['webclient'] = "neo". The shell lives in views/neo, modules provide
 * their UI in views/neo/Index.mjs.
 *
 * neo resolves its workers, theme CSS and the app relative to the document base
 * and assumes the page sits at apps/<name>/index.html, so the page gets
 * <base href="views/neo/apps/go/">.
 */
class Neo {

	use SingletonTrait;

	public static function enabled(): bool
	{
		return (go()->getConfig()['webclient'] ?? null) === 'neo';
	}

	/**
	 * Files of all installed modules that ship a neo UI
	 *
	 * @param string $name file in the module's views/neo folder
	 * @return string[] URLs relative to the web root, cache-busted with the modification time
	 */
	private function moduleFiles(string $name): array
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
	 * to it. Its name carries the GO version and the newest mtime of the neo UI
	 * sources and theme map, so a changed UI gets a new worker instead of the old code.
	 */
	private function buildId(): string
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
		return go()->getVersion() . '-' . $mtime;
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
			// set in a popup window opened by GO.view.Dialog: id of the dialog to adopt
			'goPopup' => $this->popupId(),
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
	<link rel="stylesheet" href="<?= $neo ?>node_modules/@fortawesome/fontawesome-free/css/all.min.css">
<?php foreach ($this->moduleFiles('style.css') as $css): ?>
	<link rel="stylesheet" href="<?= $root . $css ?>">
<?php endforeach; ?>
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
