<?php
namespace go\core\webclient;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * neo.mjs imports ES modules without version query strings, so every views/neo folder must make
 * the browser revalidate them. Without it a browser keeps a module file from its heuristic cache
 * and runs old code after an update (the history module page stayed empty after its fix).
 */
class NeoCacheHeadersTest extends TestCase
{
	/**
	 * @return array<string, array{string}> views/neo folders of core and the installed modules (also those
	 *     of other repositories mounted into go/modules, e.g. sf/workspaces)
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
			$cases[substr($folder, strlen($root) + 1)] = [$folder];
		}
		return $cases;
	}

	#[DataProvider('neoFolders')]
	public function testNeoFolderIsAlwaysRevalidated(string $folder): void
	{
		$file = $folder . '/.htaccess';
		$this->assertFileExists($file, 'Copy views/neo/.htaccess of the notes module');

		$htaccess = file_get_contents($file);
		$this->assertStringContainsString('Header set Cache-Control "no-cache"', $htaccess);
		$this->assertMatchesRegularExpression('/FilesMatch "[^"]*mjs[^"]*"/', $htaccess);
	}
}
