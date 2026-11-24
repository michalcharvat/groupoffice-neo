# Writing tests

> Moved verbatim from CLAUDE.md on 2026-11-24.

## Writing tests

### PHP
- Tests are PHPUnit (config `tests/phpunit.xml`, suites `core`, `modules`, `api`). They run against a real installed database, not mocks, via `tests/bootstrap-install.php`.
- Mirror the source namespace: `go\core\util\IpAddress` is tested in `tests/go/core/util/IpAddressTest.php`. Module tests go in `tests/go/modules/<package>/<module>/`.
- Classes extend `PHPUnit\Framework\TestCase`, are named `<Class>Test`, and use `testSomething` methods. Use data providers for many inputs (see `IpAddressTest`). A leading underscore (`_testFoo`) disables a test, so don't use it for new ones.
- For ORM and JMAP behaviour, follow `tests/go/core/orm/EntityTest.php` and `tests/go/core/jmap/`. Test entities live in the `community/test` module.
- Leave the database as you found it: delete the entities you create.
- Write tests with performance in mind; the whole suite runs often. `setUp()` runs before every test and every data provider row:
  - Create fixtures that tests only read (users that act, groups, permissions, books, module tables of `ModuleTablesTrait`) once per class in `setUpBeforeClass()` and remove them in `tearDownAfterClass()`. Create what a test changes in the test itself or in `setUp()`. See `tests/go/core/controller/UserTest.php` and `tests/go/modules/business/finance/controller/FinanceDocumentTest.php`.
  - PHPUnit doesn't call `tearDownAfterClass()` when `setUpBeforeClass()` fails, so catch the exception there, clean up and throw it again.
  - Check a class with shared fixtures with `--order-by=random`: a test must not depend on what another test changed.
  - Hash passwords and secrets with `go\core\util\Password::hash()`, not `password_hash()`. The tests set a low cost with `passwordHashCost` in `tests/config.php`; the default cost takes 0.2 seconds per hash.
  - Don't call external services. The test bootstrap disables the pwned module for that reason.
  - Find slow tests with `--log-junit <file>`, which records the time of every test.
- Run a single test: `tools/phpunit <path>` (see "Running tests").

### Typescript (GOUI)
- Tests are mocha with chai's `expect`, in `www/views/goui/goui/tests/lib/`, mirroring `script/`: `script/util/Format.ts` is tested in `tests/lib/util/Format.ts`. Group tests with `describe()` per class and method and write `it()` texts as behaviour ("Decodes entities").
- Import the source with a `.js` extension (`../../../script/util/Format.js`), like the existing tests.
- Tests run in jsdom, not a browser. jsdom-global doesn't expose every browser global (`DOMParser` is missing), and jsdom doesn't load images or run `onerror`, so a test can't prove that an XSS payload doesn't run. Check that in a real browser, e.g. headless Chrome with `--dump-dom`, and test the output (text, elements, attributes) in mocha.
- Run `npx tsc --noEmit` in the `goui` folder as well; mocha (through tsx) doesn't check types.
- `goui` and `groupoffice-core` are git submodules: commit the change and its test in the submodule, then the submodule pointer in this repository.

> "Running tests" = the section of that name in CLAUDE.md.
