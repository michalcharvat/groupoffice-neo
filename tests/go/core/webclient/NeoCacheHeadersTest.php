<?php
namespace go\core\webclient;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * neo.mjs imports ES modules without version query strings, so the browser must revalidate every
 * file of a views/neo folder. Without it a browser keeps a module file from its heuristic cache
 * and runs old code after an update (the history module page stayed empty after its fix, the
 * workspaces of a closed window did not come back). One rule in www/.htaccess covers core and
 * every module; the Debian Apache config has the same rule (it skips .htaccess).
 */
class NeoCacheHeadersTest extends TestCase
{
	/**
	 * @return array<string, array{string}> views/neo folders of core and the installed modules (also those
	 *     of other repositories mounted into go/modules, e.g. sf/workspaces), relative to the install path
	 */
	public static function neoFolders(): array
	{
		$root = go()->getEnvironment()->getInstallPath();
		$folders = array_merge(
			[$root . '/views/neo'],
			glob($root . '/go/modules/*/*/views/neo', GLOB_ONLYDIR) ?: [],
			glob($root . '/modules/*/views/neo', GLOB_ONLYDIR) ?: []
		);

		$cases = [];
		foreach ($folders as $folder) {
			$relative = substr($folder, strlen($root) + 1);
			$cases[$relative] = [$relative];
		}
		return $cases;
	}

	/**
	 * @return string the file path pattern of the no-cache rule in www/.htaccess
	 */
	private static function rulePattern(): string
	{
		$htaccess = file_get_contents(go()->getEnvironment()->getInstallPath() . '/.htaccess');
		self::assertIsString($htaccess, 'www/.htaccess is missing');
		// the pattern of the block that sets the header, not of any other <If>
		self::assertSame(1, preg_match(
			'/<If "%\{REQUEST_FILENAME\} =~ m#([^#]+)#">\s*Header set Cache-Control "no-cache"\s*<\/If>/',
			$htaccess,
			$matches
		), 'www/.htaccess must set Cache-Control: no-cache for the views/neo files');

		return '#' . $matches[1] . '#';
	}

	#[DataProvider('neoFolders')]
	public function testNeoFolderIsAlwaysRevalidated(string $folder): void
	{
		$pattern = self::rulePattern();
		$root    = go()->getEnvironment()->getInstallPath();

		foreach (['Index.mjs', 'view/Main.mjs', 'style.css', 'resources/theme-map.json', 'lib/vendor.js'] as $file) {
			$this->assertMatchesRegularExpression($pattern, $root . '/' . $folder . '/' . $file);
		}

		$this->assertDoesNotMatchRegularExpression($pattern, $root . '/' . $folder . '/apps/go/index.html');
	}

	public function testOtherFilesAreNotAffected(): void
	{
		$pattern = self::rulePattern();

		$root    = go()->getEnvironment()->getInstallPath();

		foreach (['/views/Extjs3/javascript/go.js', '/api/jmap.php', '/go/modules/community/notes/views/goui/dist/Index.js'] as $file) {
			$this->assertDoesNotMatchRegularExpression($pattern, $root . $file);
		}
	}
}
