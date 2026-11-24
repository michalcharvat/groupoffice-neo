<?php
namespace go\core\webclient;

use GO\Base\View\FileView;
use PHPUnit\Framework\TestCase;

/**
 * Standalone pages and the server code that must work in a build without the classic client
 * (views/Extjs3, views/goui; docs/neo-switch.md, section 8)
 */
class PageTest extends TestCase
{
	private function render(string $html, ?string $title = null): string
	{
		ob_start();
		try {
			Page::render($html, $title);
		} finally {
			$out = ob_get_clean();
		}
		return $out;
	}

	public function testPageLinksTheStandaloneStylesheetOnly(): void
	{
		$out = $this->render('<section><fieldset><h1>Hello</h1></fieldset></section>', 'Test');

		$this->assertStringContainsString('views/neo/dist/page.css', $out);
		$this->assertStringContainsString('<section><fieldset><h1>Hello</h1></fieldset></section>', $out);
		$this->assertStringContainsString('class="go-page ', $out);
		$this->assertStringNotContainsString('views/Extjs3', $out);
		$this->assertStringNotContainsString('views/goui', $out);
		$this->assertStringEndsWith("</html>\n", $out);
	}

	public function testTitleIsEscaped(): void
	{
		$out = $this->render('', '<script>alert(1)</script>');
		$this->assertStringNotContainsString('<script>alert(1)', $out);
		$this->assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $out);
	}

	public function testBodyClassIsEscaped(): void
	{
		ob_start();
		Page::header(null, '"><script>');
		Page::footer();
		$out = ob_get_clean();
		$this->assertStringNotContainsString('"><script>', $out);
	}

	public function testColorVarsTakeValidColoursOnly(): void
	{
		$settings = (object) [
			'primaryColor' => '1652a1',
			'secondaryColor' => 'red;}body{display:none',
			'tertiaryColor' => null,
			'accentColor' => 'ff7200'
		];
		$css = Page::colorVars($settings, 'Color');

		$this->assertStringContainsString('--fg-main: #1652a1;', $css);
		$this->assertStringContainsString('--fg-main-tp: rgba(22, 82, 161, .16);', $css);
		$this->assertStringContainsString('--c-accent: #ff7200;', $css);
		$this->assertStringNotContainsString('display', $css);
		$this->assertStringNotContainsString('--c-primary', $css);
	}

	/**
	 * Every legacy controller (index.php?r=…) answers through these views; they used to live in
	 * views/Extjs3
	 */
	public function testLegacyViewsLiveOutsideTheClassicClient(): void
	{
		$path = FileView::templatePath();
		$this->assertStringNotContainsString('/views/', $path);
		foreach (['Default', 'Exception', 'Disabled', 'Plain', 'Reminder'] as $view) {
			$this->assertFileExists($path . $view . '.php');
			$this->assertFileDoesNotExist(go()->getEnvironment()->getInstallPath() . '/views/Extjs3/' . $view . '.php');
		}
		$this->assertSame($path . 'Exception.php', (new FileView())->findViewFile('Exception'));
	}

	public function testPlainViewRendersTheStandalonePage(): void
	{
		ob_start();
		(new FileView())->render('Plain', '<p>No files</p>');
		$out = ob_get_clean();

		$this->assertStringContainsString('views/neo/dist/page.css', $out);
		$this->assertStringContainsString('<p>No files</p>', $out);
	}

	/**
	 * Files of views/neo that the server serves or reads instead of their views/Extjs3 originals
	 */
	public function testNeoCopiesOfClassicAssetsExist(): void
	{
		$neo = go()->getEnvironment()->getInstallPath() . '/views/neo/resources/';
		foreach (['images/logo-white.svg', 'images/default-app-icon.svg', 'images/reminder.png', 'images/filetype/unknown.svg',
			'images/filetype/folder.svg', 'images/filetype/folder_shared.svg', 'sounds/dialog-question.mp3',
			'fonts/Lato-Regular.woff2', 'fonts/Lato-Bold.woff2', 'scss/page/page.scss'] as $file) {
			$this->assertFileExists($neo . $file);
		}
	}

	/**
	 * PHP outside views/ may only touch files of the classic client after checking that they exist.
	 * A file that starts to reference them must decide: guard it (Webclient::classicAvailable(),
	 * is_file()) and join this list, or use neutral code (Page, views/neo).
	 */
	public function testNoNewReferencesToClassicFiles(): void
	{
		$allowed = [
			'go/base/Module.php', // legacy module icon, file_exists()
			'go/base/mail/Message.php', // htmleditor.css of the theme, is_file()
			'go/base/util/StringHelper.php', // emoticon images, file_exists()
			'go/base/view/Extjs3.php', // the classic view, Webclient::classicAvailable() in CoreController::actionThemes()
			'go/core/App.php', // legacy module icon, exists()
			'go/core/webclient/Extjs3.php', // the classic client
			'go/core/webclient/Webclient.php', // classicAvailable()
			'go/modules/community/dev/model/LanguageScanner.php', // is_dir()
		];

		$root = go()->getEnvironment()->getInstallPath();
		$found = [];
		$it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
		foreach ($it as $file) {
			$rel = substr($file->getPathname(), strlen($root) + 1);
			if ($file->getExtension() !== 'php' || preg_match('~^(vendor|views|node_modules)/|/(node_modules|Z-Push|z-push|language|views)/|^go/modules/(amd|business|sf|nuw)/~', $rel)) {
				continue;
			}
			// PHP code only: comments, docblocks and HTML outside <?php may name the old paths
			$code = '';
			foreach (token_get_all(file_get_contents($file->getPathname())) as $token) {
				if (is_array($token) && in_array($token[0], [T_COMMENT, T_DOC_COMMENT, T_INLINE_HTML], true)) {
					continue;
				}
				$code .= is_array($token) ? $token[1] : $token;
			}
			if (preg_match('~views/(Extjs3|extjs3|goui)\b~', $code) && !in_array($rel, $allowed, true)) {
				$found[] = $rel;
			}
		}

		$this->assertSame([], $found, 'PHP outside views/ that reads files of the classic client without a guard');
	}
}
