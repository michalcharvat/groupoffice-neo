# GroupOffice

Write the product name as "GroupOffice" in new text (changelog, messages, comments, docs), not "Group-Office" or "Group Office". Older code and changelog entries still use "Group-Office"; leave those unless asked.

## Where the detail lives

| Working on | Read first |
|---|---|
| Translations, language files | `docs/translations.md` |
| Writing PHPUnit tests | `docs/writing-tests.md` |
| Converting ExtJS to GOUI, building and styling GOUI | `docs/goui-frontend.md` |
| neo web client | `docs/neo-*.md` |
| Code outside a business module that touches its classes, `defineListeners()` | `docs/encoded-business-modules.md` |

## Reuse existing code

Before writing any helper or utility (IP/CIDR, string, date, URL, file, crypto, etc.), search for existing functionality and reuse or extend it instead of duplicating it. Check at least:

- `www/go/core/` (e.g. `IpAddress`, `StringUtil`, `Url`, `DateTime`, `Crypt`)
- the surrounding module/namespace of the code you're changing
- `git log -S<keyword>` / grep for the concept by name and synonyms

Mention in your reply which existing util you found and reused, or that none exists.

## Prefer the new stack

We are migrating away from legacy code. When writing new code or changing existing code, favour the new frameworks:

- **Frontend: use GOUI where possible.** ExtJS is the old framework and the goal is to replace it with GOUI. Don't build new UI in ExtJS unless there is no GOUI alternative.
- **Backend: favour `go\core` over `GO\Base`.** `GO\Base` is the old code base; new code belongs in `go\core`.
- **API: JMAP.** The goal is to rewrite everything to JMAP. Expose new functionality through JMAP (`go\core\jmap`) rather than legacy controllers/RPC.


## Running tests

#### PHP
Run phpunit as `www-data`, never as root. Use `tools/phpunit <path>` from the docker-groupoffice-development checkout (it runs as `www-data`; `-c <service>` picks another container than `groupoffice`, `-m install|upgrade|existing` the mode, default `install`, and `existing` runs against the existing database with Xdebug) or `docker compose exec -u www-data groupoffice ...`. Running as root creates root-owned files in `/tmp/phpunit`, `/tmp/groupoffice` and `/var/lib/groupoffice` and breaks the tooling. Tests live in `tests/` (`/usr/local/share/src/tests` in the container).

- Suggest creating tests when they will benefit security and stability of the system

#### Typescript (GOUI)

Run mocha on the host from `www/views/goui/goui` with `npm test`, or `../../../node_modules/.bin/mocha` (mocha, tsx, chai and jsdom are installed in `www/node_modules`). `.mocharc.json` there sets up jsdom and always loads every file in `tests/`, so a path argument doesn't limit the run. Pick tests with `--grep <describe or it text>`. Running one file first fails with `Collection is not a constructor` because of the import order, also for existing tests.

## Environment

The app runs in Docker (the docker-groupoffice-development checkout, service `groupoffice`, with a `db` service for MariaDB). This repo is mounted as the source. Run PHP, phpunit and CLI commands inside the container, not on the host.

## Commits and changelog

- Commit each feature or fix in separate commits.
- Commit messages are short and start with a type or module: `Fixed: ...`, `Core: ...`, `Files: ...`. Reference the issue number when there is one (`#1593`).
- User-visible changes get a line in `CHANGELOG.md`. Unreleased entries go at the top of the file, above the newest version header, as `- Module: description #issue`. Security fixes are written so that a user understands the impact and any config they need to change.
  Never commit CHANGELOG.md. This will be reviewed manually and committed by hand.
- Never push to origin.

## Database changes

Schema changes go in the module's `install/updates.php` as a new entry keyed by timestamp (`$updates['YYYYMMDDHHMM'][] = "SQL"` or a closure). Never edit an existing update entry, because it has already run on installations. Core updates are in `www/go/core/install/updates.php`. Update `install.sql` only if the module has one for fresh installs.

## Translations

Never hardcode UI text. Use `go()->t("Text")` in PHP. Strings live in the module's `language/<lang>.php` (English is the source, `en.php`). Add new strings to `en.php`. Core translations are in `www/go/core/language/`.

The rules for language files, argument order and adding translations are in `docs/translations.md`.

## Permissions and security

- Every new JMAP entity and controller must enforce ACL. Use `Entity::hasPermissionLevel()`, `applyAclToQuery()` and `internalGetPermissionLevel()`, and don't skip them for convenience.
- Admin-only or privileged behaviour needs a test that proves the guard actually fires. Recent fixes (#1593) were guards that never triggered.
- Don't trust client-supplied properties on save, and never expose secrets to the browser.
- Take the client IP from the existing `IpAddress` util, never from `X-Forwarded-For` directly.
- In controller methods, load entities with `$this->getEntity()` or `findEntity()`, which check read permission, not `Model::findById($params[...])`, which checks nothing. Methods that change data or send mail need a write or manage check on the entity or its container.
- Don't override `checkModulePermissions()` to return true without another guard, don't pass `$params` straight to `setValues()`, and don't return SQL in responses unless the debugger is enabled.
- When you change a public controller method, check its permission guard first. Every public method of a JMAP controller can be called by any user with access to the module.
- Document the permission of every custom controller method with `@apiPermission` (shown in `/api/doc.php`). `tests/go/core/jmap/ControllerPermissionTest.php` fails when a public controller method has no recognisable permission check. When access to the module is really enough, start the text with `Module access:` and give the reason; when the check is elsewhere, start with `Checked in <Class::method()>:`. Tag a custom method that only reads with `@apiReadOnly`: clients that may only read, like AI assistants with read access, can then call it. A method without the tag counts as one that changes data.

## Encoded business modules

- Code outside a business module must not load its classes until it has checked the module, through its unencoded `Module.php`: `class_exists(...\Module::class) && ...\Module::get()->isAvailable()` (see `GO\Email\EmailModule::defineListeners()`). `class_exists()` on any other class of the module loads the file. Using `Foo::class` as a string or in a `use` statement is safe.

Why, and the check for `defineListeners()`: `docs/encoded-business-modules.md`.

## Static analysis

- PHPStan (level 3, config `tests/phpstan.neon`, covers `www/api` and `www/go`): from `www/` run `composer go:analyse` (inside the container). New code should not add errors. It runs in GitHub Actions (`.github/workflows/phpstan.yml`); existing errors are in `tests/phpstan-baseline.neon`, so only new errors fail. Fix an error instead of adding it to the baseline. After fixing an old error, lower its count or remove its entry in the baseline by hand. Regenerate the baseline only with `scripts/phpstan-baseline.sh` (on the host), which analyses a copy without the modules of other repositories, like CI does; locally the business and customer modules add their own errors (see `tests/phpstan-baselines.php`). A module folder in its own repository has its own `phpstan-baseline.neon`; regenerate it in the container from `www/` with `php ../scripts/phpstan-module-baseline.php business`.
- Semgrep (`scripts/semgrep.sh`, security rule sets for PHP, JS/TS and secrets) and Qodana (`qodana.yaml`) run on the codebase as well. Don't introduce findings such as SQL built from user input, and don't commit secrets.
- Don't analyse or edit vendored code, `activesync` or Z-Push (excluded in the configs).

## PHP style

- Indent with tabs, not spaces. Opening brace placement follows the file you're editing (existing code mixes styles, so don't reformat lines you aren't changing).
- Use namespaced `go\...` classes with PSR-4 style paths matching the namespace, and `go()` instead of `GO::`.
- Add parameter and return types to new methods (the minimum supported PHP version is 8.2, so no 8.3+ features such as typed class constants, `json_validate()` or property hooks and asymmetric visibility from 8.4). Write a short docblock for public methods, as in `go\core\util\IpAddress`.
- Don't make unrelated formatting changes. They hide the real change in diffs.

## Keeping this file small

`CLAUDE.md` is loaded into every session; `docs/*.md` are read on demand.

- **New findings go to `docs/`, never here.** Append to the matching doc; a new area
  gets a new `docs/<topic>.md` and one row in the table above.
- A line belongs here only if a session must know it BEFORE acting: overview, the
  docs table, hard rules, commands.
- **Budget: 12 KB** (a hook warns above it). Shrink with `go:claude-md-trim` — moves only, verified lossless.
