// Finds GO CSS classes that a neo class renders but whose styles neo does not load with it.
//
// neo loads a class's theme files by className (GO.a.view.B → resources/css/src/apps/go/a/view/B.css,
// a leading "view" dropped) plus those of its parent classes and its `additionalThemeFiles`.
// The GO overlays of neo classes (resources/css/theme-go) and Global.css are always there.
// A `go-*` class that a component renders but that is only styled in the sheet of another
// component works only on pages where that other component happens to be loaded too.
//
// Exits with 1 when it finds one. Run `npm run build-themes` first (reads resources/css). Usage:
//   node buildScripts/auditStyles.mjs          report
//   node buildScripts/auditStyles.mjs --json   machine readable
//   node buildScripts/auditStyles.mjs --all    also sub components that load with the sheet's class
import fs   from 'node:fs';
import path from 'node:path';

const root    = path.resolve(import.meta.dirname, '..'),
      www     = path.resolve(root, '../..'),
      cssSrc  = path.join(root, 'resources/css/src'),
      cssGo   = path.join(root, 'resources/css/theme-go'),
      jsRoots = [path.join(root, 'src'), path.join(root, 'apps'), ...moduleViewDirs()];

function moduleViewDirs() {
    const dirs = [];

    for (const base of [path.join(www, 'go/modules'), path.join(www, 'modules')]) {
        for (const pkg of fs.existsSync(base) ? fs.readdirSync(base) : []) {
            const direct = path.join(base, pkg, 'views/neo');

            if (fs.existsSync(direct)) {
                dirs.push(direct);
                continue
            }

            const pkgDir = path.join(base, pkg);

            if (fs.statSync(pkgDir).isDirectory()) {
                for (const mod of fs.readdirSync(pkgDir)) {
                    const dir = path.join(pkgDir, mod, 'views/neo');
                    fs.existsSync(dir) && dirs.push(dir)
                }
            }
        }
    }

    return dirs
}

function walk(dir, ext, out = []) {
    for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}) : []) {
        const p = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            entry.name !== 'node_modules' && entry.name !== 'dist' && walk(p, ext, out)
        } else if (entry.name.endsWith(ext)) {
            out.push(p)
        }
    }

    return out
}

/**
 * @param {String} css
 * @returns {Set<String>} go-* classes that lead a selector
 */
function cssClasses(css) {
    const result = new Set();

    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // selectors: text before "{" that is not a declaration. A class counts as styled by the sheet
    // only where it leads its selector (".go-x .go-y" styles go-x; go-y there is an override
    // inside go-x, which needs go-x's own sheet anyway)
    for (const [, group] of css.matchAll(/([^{};]+)\{/g)) {
        for (const selector of group.split(',')) {
            const first = [...selector.matchAll(/\.(go-[a-z0-9_-]+)/g)].map(m => m[1]).find(cls => !context.has(cls));
            first && result.add(first)
        }
    }

    return result
}

// containers of the base components: a selector scoped to them still styles the class after them
// (".go-dialog-body > .go-otp-enable-form" styles go-otp-enable-form)
const context = new Set(['go-dialog-body', 'go-main-3-col', 'go-west', 'go-center', 'go-east']);

function themeNs(className) {
    const parts = className.split('.');

    parts.shift();
    parts[0] === 'view' && parts.shift();

    return parts.join('/')
}

// ---- sheets ------------------------------------------------------------------------------------
const sheets = new Map(); // "a/b/C" → Set of classes

for (const file of walk(cssSrc, '.css')) {
    const rel = path.relative(cssSrc, file).replace(/\.css$/, '');

    // apps/go/a/B → a/B
    rel.startsWith('apps/go/') && sheets.set(rel.slice('apps/go/'.length), cssClasses(fs.readFileSync(file, 'utf8')))
}

if (!sheets.size || !fs.existsSync(path.join(cssGo, 'Global.css'))) {
    console.error('No generated CSS in resources/css: run `npm run build-themes` first');
    process.exit(2)
}

const always = new Set();

for (const file of walk(cssGo, '.css')) {
    cssClasses(fs.readFileSync(file, 'utf8')).forEach(cls => always.add(cls))
}

// ---- classes ------------------------------------------------------------------------------------
const classes = new Map(), // className → {file, parent, tokens, additional, imports}
      helpers = new Map(); // file without a class (renderers like detail/historyCells.mjs) → tokens

/**
 * @param {String} src
 * @returns {Set<String>} classes the code renders: not selectors ('.go-x', drag/drop delegates),
 * not ntypes, not comments
 */
function renderedTokens(src) {
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/ntype\s*:\s*'go-[^']*'/g, '');

    return new Set([...code.matchAll(/(?<![.\w-])(go-[a-z0-9_-]+)/g)].map(m => m[1]))
}

const exported = new Map(); // file → {default: className, named: Map local name → className}

for (const file of walk(jsRoots[0], '.mjs').concat(...jsRoots.slice(1).map(d => walk(d, '.mjs')))) {
    const src = fs.readFileSync(file, 'utf8'),
          // declarations at a line start, not an example in a doc comment
          decls = [...src.matchAll(/^(export\s+default\s+)?class\s+(\w+)\s+extends\s+(\w+)/gm)];

    if (!decls.length) {
        helpers.set(file, renderedTokens(src));
        continue
    }

    const imports = [...src.matchAll(/import\s+[^;]*?from\s+'(\.[^']+)'/g)].map(m => path.resolve(path.dirname(file), m[1])),
          // a class body ends at the first "}" at a line start
          blocks  = decls.map(decl => {
              const end = src.slice(decl.index).search(/^}/m);
              return [decl.index, end < 0 ? src.length : decl.index + end + 1]
          }),
          // module code outside the classes (constants, renderers, the export) belongs to every class of the file
          shared  = blocks.reduce((rest, [from, to], i) => rest + src.slice(i ? blocks[i - 1][1] : 0, from), '') + src.slice(blocks.at(-1)[1]),
          locals  = new Map(), // local class name → className
          found   = [];

    decls.forEach((decl, i) => {
        const block = src.slice(...blocks[i]),
              // a static config line, not a lookup like up({className: '...'})
              name  = block.match(/^\s*className\s*:\s*'(GO\.[\w.]+)'/m)?.[1];

        if (!name) {
            return
        }

        const extend = decl[3],
              named  = src.match(new RegExp(`import\\s+(?:\\w+\\s*,\\s*)?\\{[^}]*\\b${extend}\\b[^}]*\\}\\s+from\\s+'([^']+)'`))?.[1],
              def    = src.match(new RegExp(`import\\s+${extend}\\b[^;]*?\\s+from\\s+'([^']+)'`))?.[1],
              imp    = named || def;

        locals.set(decl[2], name);
        decl[1] && (exported.get(file) || exported.set(file, {named: new Map()}).get(file)).default === undefined &&
            (exported.get(file).default = name);
        found.push([name, {
            file,
            local     : decl[2],
            block,
            // a class of the same file, or the default or a named export of an imported file
            parentRef : {local: extend, named: !!named, file: imp?.startsWith('.') ? path.resolve(path.dirname(file), imp) : null},
            tokens    : new Set([...renderedTokens(shared), ...renderedTokens(block)]),
            additional: [...block.matchAll(/additionalThemeFiles\s*:\s*\[([^\]]*)\]/g)]
                .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])),
            imports
        }]);
    });

    found.forEach(([name, info]) => {
        info.locals = locals;
        classes.set(name, info)
    });

    if (!found.length) {
        continue
    }

    const exp = exported.get(file) || exported.set(file, {named: new Map()}).get(file),
          // export default Neo.setupClass(X) / export default X; unresolved stays undefined
          def = src.match(/^export\s+default\s+(?:Neo\.setupClass\()?(\w+)/m)?.[1];

    exp.default ??= locals.get(def);
    [...src.matchAll(/^export\s*\{([^}]*)\}/gm)].forEach(m => m[1].split(',').forEach(part => {
        const [local, alias = local] = part.trim().split(/\s+as\s+/);
        locals.has(local) && exp.named.set(alias, locals.get(local))
    }))
}

// markup of a helper module counts as rendered by every class that imports it
for (const info of classes.values()) {
    info.imports.forEach(file => helpers.get(file)?.forEach(token => info.tokens.add(token)))
}

/**
 * @param {String} className
 * @returns {String|undefined} className of the parent class, when it is one of ours
 */
function parentOf(className) {
    const info = classes.get(className);

    if (!info) {
        return undefined
    }

    const {local, named, file} = info.parentRef,
          exp = file && exported.get(file);

    return info.locals.get(local) || (named ? exp?.named.get(local) : exp?.default)
}

/**
 * @param {String} className
 * @returns {Boolean} a GO.view.Dialog: it can pop out into its own window without its opener
 */
function isDialog(className, seen = new Set()) {
    if (className === 'GO.view.Dialog') {
        return true
    }

    const parent = parentOf(className);

    return !!parent && !seen.has(parent) && (seen.add(parent), isDialog(parent, seen))
}

/**
 * @param {String} className
 * @returns {Set<String>} sheets neo loads with the class
 */
function loadedSheets(className, seen = new Set()) {
    const info = classes.get(className);

    if (!info || seen.has(className)) {
        return seen
    }

    seen.add(className);

    const parentName = parentOf(className);
    parentName && loadedSheets(parentName, seen);
    info.additional.forEach(ns => loadedSheets(ns, seen));

    return seen
}

// importers: a class that only other classes import loads together with them
const importers = new Map(); // file → Set of classNames importing it

for (const [className, info] of classes) {
    info.imports.forEach(file => importers.set(file, (importers.get(file) || new Set()).add(className)))
}

/**
 * @param {String} className
 * @param {String} sheet
 * @returns {Boolean} every page that loads the class also loads the sheet (through its importers)
 */
function coLoaded(className, sheet, seen = new Set()) {
    if (seen.has(className)) {
        return true
    }

    seen.add(className);

    // classes of one file load together; a dialog pops out into its own window, so for a dialog
    // only a class of its file that it creates itself (a panel in its body) counts
    const own    = classes.get(className),
          dialog = isDialog(className);

    if ([...classes].some(([name, info]) => info.file === own.file &&
        (name === className || !dialog || (!isDialog(name) && new RegExp(`\\b${info.local}\\b`).test(own.block))) &&
        [...loadedSheets(name)].map(themeNs).includes(sheet))) {
        return true
    }

    // a dialog pops out into its own window: no other class is there
    if (isDialog(className)) {
        return false
    }

    const users = importers.get(classes.get(className).file);

    return !!users?.size && [...users].every(user => coLoaded(user, sheet, seen))
}

// ---- report -------------------------------------------------------------------------------------
const findings = [],
      // --all: also classes that only load together with the sheet's class (sub dialogs, addons)
      all      = process.argv.includes('--all');

// main thread addons are no components (their DOM lives in the component that uses them),
// the dev playground mounts its demos itself
const skip       = /^GO\.(main\.addon|dev)\./,
      // checked by hand: className → classes it may use from another sheet, and why
      allowed    = {
          // MenuList.showAt({cls: ['go-menu', ...]}): an instance of GO.menu.List
          'GO.form.field.AutocompleteField'   : ['go-menu'],
          // {module: SmimeBar, cls: [...]}: an instance of GO.smime.SmimeBar
          'GO.smime.CertificateDetailWindow'  : ['go-smime-bar'],
          // the container a MultiSelectToolbar covers (documented in MultiSelectToolbar.mjs):
          // only meaningful next to that toolbar, which loads the sheet
          'GO.addressbook.view.AddressBookMain': ['go-mstb-host'],
          'GO.maildomains.view.DomainGridCard' : ['go-mstb-host'],
          'GO.notes.view.NotesMain'            : ['go-mstb-host'],
          'GO.tasks.TasksMain'                 : ['go-mstb-host'],
          'GO.files.view.FilesMain'            : ['go-mstb-host'],
          'GO.email.EmailMain'                 : ['go-mstb-host'],
          'GO.grid.ListToolbar'                : ['go-mstb-host'],
          // messageHtml.mjs: 'go-email' is the class prefix it builds names from ('go-email-...')
          'GO.email.message.MessagePanel'      : ['go-email']
      };

for (const [className, info] of classes) {
    if (skip.test(className)) {
        continue
    }

    const own      = loadedSheets(className),
          ownSheet = new Set([...own].map(themeNs)),
          styled   = new Set();

    ownSheet.forEach(sheet => sheets.get(sheet)?.forEach(cls => styled.add(cls)));

    for (const token of info.tokens) {
        if (always.has(token) || styled.has(token) || allowed[className]?.includes(token)) {
            continue
        }

        const elsewhere = [...sheets].filter(([, set]) => set.has(token)).map(([sheet]) => sheet);

        if (!elsewhere.length || (!all && elsewhere.some(sheet => coLoaded(className, sheet)))) {
            continue
        }

        findings.push({
            className,
            file : path.relative(www, info.file),
            token,
            styledIn: elsewhere
        })
    }
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 1))
} else {
    const bySheet = new Map();

    findings.forEach(f => {
        const key = f.styledIn.join(', ');
        bySheet.set(key, [...(bySheet.get(key) || []), f])
    });

    for (const [sheet, list] of [...bySheet].sort()) {
        console.log(`\n${sheet}`);
        list.forEach(f => console.log(`  ${f.token.padEnd(34)} rendered by ${f.className}`))
    }

    console.log(findings.length
        ? `\n${findings.length} classes rendered without their styles loaded: move each style to the sheet of the\n` +
          'class that renders it, to resources/scss/go/shared (several classes), or a partial both sheets @use'
        : 'every rendered GO class has its styles loaded')
}

process.exitCode = findings.length ? 1 : 0
