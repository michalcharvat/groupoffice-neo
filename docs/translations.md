# Translations

> Moved verbatim from CLAUDE.md on 2026-11-24.

- The English text is the key, so it must be correct English: no typos, no Dutch or German. Fixing a key means changing the source and every language file; if the corrected text already exists (often in core), remove the old entries instead of renaming them.
- Argument order differs: `go()->t($text, $package, $module)`, legacy `GO::t($text, $module, $package)`, ExtJS (`.js`) `t($text, $module, $package)` and GOUI (`.ts`) `t($text, $package, $module)`. Both default to the current module. Swapped arguments fall back to core without an error, so the module's translations are silently unused; the language export lists them as "Unknown package/module".
- Lookup falls back from the module to core. A string that two or more modules use, or that core already translates (check the Dutch core file `www/go/core/language/nl.php`), belongs in the core language file instead of each module.
- When adding translations, append entries before the closing `);` or `];` in the file's own style and indentation. Don't rewrite a file with `var_export()`; that reformats every line.
- Keep placeholders exactly as in the source (`{count}`, `{{contact.name}}`, `%s`, HTML tags, `\n`). Reuse the existing terms of the language file and its register: Dutch "u", German "Sie", French "vous", Spanish "usted".
- Short strings are ambiguous ("Read", "Bill", "Archive", "Split", "Quit", "To"). Check where they're used before translating: a permission level, a button (verb), a column header (noun) and a view name each need a different translation.
- To add missing translations, use the dev module: export the missing strings of a language to CSV, fill in the last column, and import it. Export finds `t()` in JS/TS and `go()->t()` / `GO::t()` in PHP and puts strings that core or several modules use in core. Import changes existing entries in place, appends new ones in the file's style, and skips translations whose placeholders differ from the English:
  ```
  docker compose exec -u www-data groupoffice php www/cli.php community/dev/Language/export --language=it --missingOnly=1 --skipPackages=agya,customs,dakram,humblebuildings,udo,intermesh,goneo,duurzaamgebouw > it.csv
  docker compose exec -u www-data groupoffice php www/cli.php community/dev/Language/import --path=it.csv
  ```
  `--skipPackages` leaves out customer modules; for legacy modules that link to another repository, give that folder name. Then check with `php -l` and the git diff.
- Language files are cached. Check new translations with a `go\core\Language` object after `initExport()`, or rebuild the cache.
