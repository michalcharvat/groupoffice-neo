// Finds styles that break dark mode (body.dark, GO tokens of resources/scss/go/goui-theme/_theme.scss).
//
// Static part: colour literals (#fff, #000, rgb(), hsl(), white/black) in resources/scss, in the
// stylesheets of module views/neo and in inline styles of .mjs views, listed with file:line. A colour
// belongs in a GO token (var(--bg-lowest), var(--fg-text), ...), which has a light and a dark value.
// The token sheets themselves (goui-theme/_theme.scss, design-tokens/) are skipped; shadows too, the
// fallback of var(--token, #fff) when the token exists, and lines marked `dark-ok: <reason>` in a
// comment (on the line or the one above) for colours that stay in dark mode on purpose (white paper).
// "Risky" = an opaque light background or a dark text colour; the rest needs a look only.
//
// Browser part: logs in headless (Playwright), switches to dark and walks every Dev demo (#dev/<id>)
// and the main view of every module with views/neo. It reports rendered elements with a light
// background, or with text that is dark on a dark background (contrast < 3), with the GO class, the
// CSS rule that sets the colour (neo default, GO theme, module sheet, inline) and a screenshot
// with the elements outlined. Only what renders without clicks is checked: dialogs, menus and
// detail panels need a visit of their own.
//
// Usage (from www/views/neo, after `npm run build-themes`):
//   node buildScripts/auditDarkMode.mjs --static                       static part only, no browser
//   node buildScripts/auditDarkMode.mjs --url http://localhost:8034   both parts
// Options: --out <dir> (default dist/dark-audit: report.md, report.json, screenshots),
//   --credentials <file> (default test/credentials.local, uses admin_username/admin_password),
//   --modules <dir,dir> module packages outside www (e.g. the amd and sf neo checkouts; route = folder name),
//   --only dev|modules, --pages <id,id> (dev ids or module names), --playwright <dir of the playwright package>
//   (it is not a dependency of views/neo; default: resolve 'playwright' normally).
// Exits with 1 on a risky literal, an unmapped neo token, a rendered finding or a page that failed.
import fs              from 'node:fs';
import path            from 'node:path';
import {pathToFileURL} from 'node:url';

const root = path.resolve(import.meta.dirname, '..'),
      www  = path.resolve(root, '../..');

let extraPackages = [];

// views behind a button (glyph name of the button to click after opening the hash); add views here
// that a hash does not reach
const clickPages = [
    {name: 'tasks/board', hash: 'tasks', click: 'view_kanban'}
];

// token sheets define the colours: literals belong there
const tokenFiles = ['resources/scss/go/goui-theme/', 'resources/scss/go/design-tokens/'],
      // a dark shadow stays right on a dark background
      skipProps  = /^(box-shadow|text-shadow|-webkit-tap-highlight-color)$/,
      literal    = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*(?:[\d.]|black|white)|(?<![\w-])(?:white|black)(?![\w-])/;

/**
 * @param {String} value CSS colour as getComputedStyle() returns it
 * @returns {Number[]|null} [r, g, b, a] (0-255, a 0-1), null when not parsable
 */
export function parseColor(value) {
    let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value || '');

    if (m) {
        let a = m[4] === undefined ? 1 : parseFloat(m[4]);
        m[4]?.endsWith('%') && (a /= 100);
        return [+m[1], +m[2], +m[3], a]
    }

    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(value || '');

    return m ? [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]] : null
}

/**
 * @param {Number[]} rgb
 * @returns {Number} WCAG relative luminance 0-1
 */
export function luminance([r, g, b]) {
    const lin = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * @param {Number[]} fg [r, g, b, a], blended over bg
 * @param {Number[]} bg [r, g, b]
 * @returns {Number} WCAG contrast ratio 1-21
 */
export function contrast(fg, bg) {
    const a     = fg[3] ?? 1,
          mixed = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)),
          [l1, l2] = [luminance(mixed), luminance(bg)].sort((x, y) => y - x);

    return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * Sorts one rendered element into a finding or none.
 * @param {Object} el {bg, color, effectiveBg, hasText, disabled} as collectElements() returns it
 * @returns {String|null} 'light-background', 'dark-text' or null
 */
export function classify(el) {
    const bg = parseColor(el.bg);

    if (bg && bg[3] >= 0.5 && luminance(bg) > 0.6) {
        return 'light-background'
    }

    if (el.hasText && !el.disabled) {
        const under = parseColor(el.effectiveBg), raw = parseColor(el.color),
              // translucent text renders blended with what is under it
              fg    = raw && under && [0, 1, 2].map(i => raw[i] * raw[3] + under[i] * (1 - raw[3]));

        if (fg && raw[3] > 0.1 && luminance(under) < 0.2 && luminance(fg) < 0.2 && contrast(fg, under) < 3) {
            return 'dark-text'
        }
    }

    return null
}

/**
 * @param {String} value CSS value
 * @returns {Number[]|null} [r, g, b, a] of its first colour literal
 */
export function literalColour(value) {
    const m = literal.exec(value);

    if (!m) return null;

    const lit = m[0].toLowerCase();

    if (lit === 'white') return [255, 255, 255, 1];
    if (lit === 'black') return [0, 0, 0, 1];

    if (lit[0] === '#') {
        // #rgb, #rgba, #rrggbb, #rrggbbaa
        const hex = lit.length <= 5 ? [...lit.slice(1)].map(c => c + c).join('') : lit.slice(1);
        return [...[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)), hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1]
    }

    const args = /\(\s*(black|white|[\d.]+[,\s]+[\d.]+[,\s]+[\d.]+)(?:\s*[,/]\s*([\d.]+))?/.exec(value.slice(m.index));

    // shortcut: hsl() is not converted, it never counts as risky; convert it when one shows up
    if (!args || lit.startsWith('hsl')) return null;

    const rgb = args[1] === 'black' ? [0, 0, 0] : args[1] === 'white' ? [255, 255, 255] : args[1].split(/[,\s]+/).map(Number);

    return [...rgb, args[2] === undefined ? 1 : +args[2]]
}

/**
 * A literal that likely breaks dark mode: a light background or a dark text colour. White text,
 * fixed accent backgrounds and borders read in both schemes and only need a look.
 * @param {String} prop
 * @param {String} value
 * @returns {Boolean}
 */
export function risky(prop, value) {
    const rgb = literalColour(value);

    // a translucent tint takes the colour of what is under it
    if (!rgb || rgb[3] < 0.5) return false;

    const l = luminance(rgb);

    return /^(background|fill)/.test(prop) || prop === 'backgroundColor' ? l > 0.6 : /^(color|stroke)$/.test(prop) ? l < 0.2 : false
}

/**
 * Colour literals in a stylesheet or a script.
 * @param {String} text file content
 * @param {Boolean} script .mjs: only lines that set a style
 * @param {Set<String>} [defined] custom properties the themes declare: their var() fallbacks are skipped
 * @returns {Object[]} [{line, prop, value, risky}]
 */
export function scanColours(text, script = false, defined = new Set()) {
    // comments blanked, newlines kept, so line numbers stay right
    const blank = s => s.replace(/[^\n]/g, ' '),
          raw   = text.split('\n'),
          // "dark-ok: <reason>" in a comment on the line or the one above: meant to stay (white paper, QR code)
          ok    = i => /dark-ok/.test(raw[i]) || /dark-ok/.test(raw[i - 1] || '');
    text = text.replace(/\/\*[\s\S]*?\*\//g, blank);
    script || (text = text.replace(/(^|[^:])\/\/.*$/gm, (m, pre) => pre + blank(m.slice(pre.length))));

    const result = [];

    // the fallback of a token that exists is never used; Sass interpolation is left out
    const bareValue = value => value.replace(/#\{[^}]*}/g, '').replace(/var\(\s*(--[\w-]+)\s*,[^()]*(?:\([^()]*\)[^()]*)*\)/g, (m, name) => defined.has(name) ? 'var()' : m);

    text.split('\n').forEach((line, i) => {
        if (ok(i)) return;

        // shortcut: script colours only as a quoted value on one line (style objects, style="..."
        // strings); template-built colours are missed
        const declarations = script
            ? [...line.matchAll(/\b(color|background(?:-color)?|backgroundColor|border(?:-color|Color)?|fill|stroke)\s*['"]?\s*:\s*(?:(['"`])([^'"`;]*)\2|([^'"`;]+))/g)].map(m => [m[1], m[3] ?? m[4]])
            : [...line.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+(?:#\{[^}]*}[^;{}]*)*)/g)].map(m => [m[1], m[2]]);

        for (const [prop, value] of declarations) {
            const bare = bareValue(value);

            if (!skipProps.test(prop) && literal.test(bare)) {
                result.push({line: i + 1, prop, value: value.trim(), risky: risky(prop, bare)})
            }
        }
    });

    return result
}

function noComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walk(dir, exts, out = []) {
    for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}) : []) {
        const p = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            !['node_modules', 'dist', 'tests', 'test'].includes(entry.name) && walk(p, exts, out)
        } else if (exts.some(ext => entry.name.endsWith(ext))) {
            out.push(p)
        }
    }

    return out
}

/**
 * @returns {Object[]} [{name, dir, module}] module views/neo folders (module: GO module name = route)
 */
function moduleViewDirs() {
    const dirs = [];

    // module packages kept in their own checkout (amd, sf neo branches)
    for (const pkgDir of extraPackages) {
        for (const mod of fs.existsSync(pkgDir) ? fs.readdirSync(pkgDir) : []) {
            const dir = path.join(pkgDir, mod, 'views/neo');
            fs.existsSync(dir) && dirs.push({dir, module: mod})
        }
    }

    for (const base of [path.join(www, 'go/modules'), path.join(www, 'modules')]) {
        for (const pkg of fs.existsSync(base) ? fs.readdirSync(base) : []) {
            const direct = path.join(base, pkg, 'views/neo');

            if (fs.existsSync(direct)) {
                dirs.push({dir: direct, module: pkg});
                continue
            }

            const pkgDir = path.join(base, pkg);

            if (fs.statSync(pkgDir).isDirectory()) {
                for (const mod of fs.readdirSync(pkgDir)) {
                    const dir = path.join(pkgDir, mod, 'views/neo');
                    fs.existsSync(dir) && dirs.push({dir, module: mod})
                }
            }
        }
    }

    return dirs
}

function readIndex(dir) {
    const file = path.join(dir, 'Index.mjs');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

function staticScan() {
    const rel   = f => f.startsWith(www) ? path.relative(www, f) : f,
          files = [
              ...walk(path.join(root, 'resources/scss'), ['.scss']).map(f => ({f, core: true, script: false})),
              ...walk(path.join(root, 'src'), ['.mjs']).map(f => ({f, core: true, script: true})),
              ...walk(path.join(root, 'apps'), ['.mjs']).map(f => ({f, core: true, script: true})),
              ...moduleViewDirs().flatMap(({dir}) => walk(dir, ['.css', '.scss', '.mjs']).map(f => ({f, core: false, script: f.endsWith('.mjs')})))
          ];

    const defined = new Set();

    for (const f of [...files.filter(x => !x.script).map(x => x.f), ...walk(path.join(root, 'node_modules/neo.mjs/resources/css'), ['.css'])]) {
        // shortcut: a token counts as defined wherever it is declared, whatever its scope
        for (const [, name] of noComments(fs.readFileSync(f, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)) defined.add(name)
    }

    return files
        .filter(({f}) => !tokenFiles.some(t => path.relative(root, f).startsWith(t)))
        .flatMap(({f, core, script}) => scanColours(fs.readFileSync(f, 'utf8'), script, defined).map(hit => ({file: rel(f), core, ...hit})))
}

/**
 * neo design tokens with a light-only literal (--neo-board-background: #f3f5f8) of the neo classes GO
 * imports, which no GO overlay (resources/scss/go) maps to a GO token: they stay light in dark mode.
 * shortcut: only classes imported by path; one reached as a parent or child of those is not seen
 * @returns {Object[]} [{file, line, prop, value}]
 */
function neoTokenScan() {
    const neoTheme = path.join(root, 'node_modules/neo.mjs/resources/css/theme-neo-light'),
          mapped   = new Set(),
          used     = new Set();

    for (const f of walk(path.join(root, 'resources/scss/go'), ['.scss'])) {
        for (const [, name] of noComments(fs.readFileSync(f, 'utf8')).matchAll(/(--[\w-]+)\s*:/g)) mapped.add(name)
    }

    for (const dir of [path.join(root, 'src'), path.join(root, 'apps'), ...moduleViewDirs().map(d => d.dir)]) {
        for (const f of walk(dir, ['.mjs'])) {
            for (const [, cls] of fs.readFileSync(f, 'utf8').matchAll(/neo\.mjs\/src\/([\w/]+)\.mjs/g)) used.add(cls + '.css')
        }
    }

    return [...used].sort().flatMap(rel => {
        const file = path.join(neoTheme, rel);

        return !fs.existsSync(file) ? [] : fs.readFileSync(file, 'utf8').split('\n').flatMap((line, i) => {
            const m = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line);
            return m && !mapped.has(m[1]) && tokenRisky(m[1], m[2]) ? [{file: path.relative(www, file), line: i + 1, prop: m[1], value: m[2].trim()}] : []
        })
    })
}

/**
 * @param {String} name custom property
 * @param {String} value
 * @returns {Boolean} a background token with a light colour or a text colour token with a dark one
 */
export function tokenRisky(name, value) {
    const rgb = literalColour(value);

    if (!rgb || rgb[3] < 0.5 || /shadow/.test(name)) return false;

    if (/background|-bg(-|$)/.test(name)) return luminance(rgb) > 0.6;

    return /color/.test(name) && !/border/.test(name) && luminance(rgb) < 0.2
}

// --- browser part ------------------------------------------------------------------------------

// runs in the page: marks visible elements with data-dark-audit and returns their colours
function collectElements() {
    const parse = globalThis.__darkAuditParse,
          skip  = 'img, svg, canvas, video, iframe, .neo-mask, [data-dark-audit-skip]',
          out   = [];

    function effectiveBg(el) {
        for (let node = el; node; node = node.parentElement) {
            const c = parse(getComputedStyle(node).backgroundColor);
            if (c && c[3] >= 0.5) return getComputedStyle(node).backgroundColor
        }

        return getComputedStyle(document.body).backgroundColor
    }

    document.querySelectorAll('[data-dark-audit]').forEach(el => el.removeAttribute('data-dark-audit'));

    for (const el of document.body.querySelectorAll('*')) {
        if (el.closest(skip)) continue;

        const rect = el.getBoundingClientRect(), style = getComputedStyle(el);

        // under 6px: tab indicators, hairlines, hidden helper textareas
        if (rect.width < 6 || rect.height < 6 || style.visibility === 'hidden' || +style.opacity === 0 || el.closest('[hidden], .neo-is-hidden')) continue;

        // an input's text is its value (shortcut: a placeholder counts with the input's colour)
        const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) ||
                  (el.matches('input:not([type=checkbox], [type=radio], [type=hidden], [type=color], [type=range]), textarea') && !!(el.value || el.placeholder)),
              bg      = parse(style.backgroundColor);

        if (!hasText && !(bg && bg[3] >= 0.5)) continue;

        // covered or clipped (a hidden helper textarea, a panel behind a dialog): not what the user sees
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;

        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) {
            const top = document.elementFromPoint(x, y);
            if (top && !el.contains(top) && !top.contains(el)) continue
        }

        el.setAttribute('data-dark-audit', out.length);
        out.push({
            bg         : style.backgroundColor,
            color      : style.color,
            effectiveBg: hasText ? effectiveBg(el) : null,
            hasText,
            disabled   : !!el.closest('[disabled], [aria-disabled="true"], .neo-disabled, .go-disabled'),
            cls        : el.className && typeof el.className === 'string' ? el.className : '',
            goCls      : el.closest('[class*="go-"]')?.className.split(/\s+/).find(c => c.startsWith('go-')) || '',
            tag        : el.tagName.toLowerCase(),
            text       : hasText ? (el.textContent.trim() || el.value || el.placeholder || '').slice(0, 40) : ''
        })
    }

    return out
}

// runs in the page: the CSS rule that sets prop on element #index (inherited colour: of the ancestor that sets it)
function findRule({index, prop}) {
    const rules = [],
          // commas of a selector list, not those inside :is() / :not()
          split = sel => sel.split(/,(?![^(]*\))/);

    // nested rules (CSS nesting) get their parent's selector: ".a { & .b {} }" → ":is(.a) .b"
    function collect(list, href, parent = '') {
        for (const rule of list) {
            let sel = '';

            if (rule.selectorText) {
                sel = !parent ? rule.selectorText : split(rule.selectorText).map(s => s.includes('&') ? s.replace(/&/g, `:is(${parent})`) : `:is(${parent}) ${s}`).join(',');
                rules.push({rule, href, sel})
            }

            rule.cssRules && collect(rule.cssRules, href, sel || parent)
        }
    }

    for (const sheet of document.styleSheets) {
        try { collect(sheet.cssRules, sheet.href || 'inline <style>') } catch (e) { /* cross origin */ }
    }

    const specificity = sel => [
        (sel.match(/#[\w-]+/g) || []).length,
        (sel.match(/\.[\w-]+|\[[^\]]+]|:(?!:)[\w-]+/g) || []).length,
        (sel.replace(/\[[^\]]+]|\([^)]*\)/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length
    ].reduce((s, n) => s * 100 + n, 0);

    const props = prop === 'color' ? ['color'] : ['background-color', 'background'];

    for (let el = document.querySelector(`[data-dark-audit="${index}"]`), inherited = false; el; el = el.parentElement, inherited = true) {
        if (props.some(p => el.style.getPropertyValue(p))) {
            return {selector: 'inline style', value: props.map(p => el.style.getPropertyValue(p)).find(Boolean), href: '', inherited}
        }

        let best = null;

        for (const {rule, href, sel} of rules) {
            const p = props.find(p => rule.style.getPropertyValue(p));
            if (!p) continue;

            let match;
            try { match = split(sel).filter(s => el.matches(s)) } catch (e) { continue }
            if (!match.length) continue;

            const score = (rule.style.getPropertyPriority(p) ? 1e9 : 0) + Math.max(...match.map(specificity));
            (!best || score >= best.score) && (best = {score, selector: sel, value: rule.style.getPropertyValue(p), href, inherited})
        }

        // a form control takes the UA's colour (buttontext, fieldtext) instead of inheriting
        if (best || prop !== 'color' || el.matches('button, input, select, textarea')) {
            return best || {selector: 'none (user agent default)', value: '', href: '', inherited}
        }
    }

    return {selector: 'none (user agent default)', value: '', href: '', inherited: false}
}

/**
 * @param {String} href stylesheet URL
 * @param {String} selector
 * @returns {String} who owns the rule: 'neo default', 'GO theme', 'module <path>', 'inline'
 */
function ruleOrigin(href, selector) {
    if (selector === 'inline style') return 'inline style';
    if (!href) return 'user agent';

    const dist = /\/dist\/development\/css\/(theme-go|src)\/(.+\.css)/.exec(href);

    if (!dist) {
        const mod = /\/((?:go\/)?modules\/.+?)\/views\/neo\//.exec(href);
        return mod ? 'module ' + mod[1] : href.replace(/^https?:\/\/[^/]+/, '')
    }

    // a rule from neo's own sheet (theme-go is theme-neo-light re-scoped) is neo's default
    const neoFile = path.join(root, 'node_modules/neo.mjs/resources/css', dist[1] === 'theme-go' ? 'theme-neo-light' : 'src', dist[2]),
          squash  = s => s.replace(/\s+/g, '').replace(/neo-theme-go/g, 'neo-theme-neo-light');

    if (fs.existsSync(neoFile) && squash(fs.readFileSync(neoFile, 'utf8')).includes(squash(selector.split(',')[0]))) {
        return 'neo default (' + dist[1] + '/' + dist[2] + ')'
    }

    return 'GO theme (' + dist[1] + '/' + dist[2] + ')'
}

async function browserScan(args) {
    const pwDir = args.playwright,
          {chromium} = pwDir ? await import(pathToFileURL(path.join(pwDir, 'index.mjs'))) : await import('playwright'),
          creds = Object.fromEntries(fs.readFileSync(args.credentials, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])),
          {default: devMenu} = await import(pathToFileURL(path.join(root, 'src/dev/menu.mjs'))),
          pages = [
              ...(args.only !== 'modules' ? devMenu.filter(m => m.demo).map(m => ({name: 'dev/' + m.id, hash: 'dev/' + m.id})) : []),
              // "#<module>" opens a module's main view; settings-only modules have none
              ...(args.only !== 'dev' ? [...new Set(moduleViewDirs().filter(d => /\bmainView\s*:/.test(readIndex(d.dir))).map(d => d.module))].sort().map(m => ({name: m, hash: m})) : []),
              ...(args.only !== 'dev' ? clickPages : [])
          ].filter(p => !args.pages || args.pages.includes(p.name.replace(/^dev\//, '')) || args.pages.includes(p.name)),
          _       = pages.length || fail('--pages matches no page'),
          browser = await chromium.launch(),
          page    = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage(),
          shots   = path.join(args.out, 'screenshots'),
          found   = new Map(),
          // shortcut: data colours are counted, not listed; list them when one needs a look
          counter = {dataColours: 0},
          errors  = [];

    fs.mkdirSync(shots, {recursive: true});

    // init script: a module may reload the page
    await page.addInitScript(`globalThis.__darkAuditParse = ${parseColor}`);
    await page.goto(args.url);
    await page.fill('input[name=username]', creds.admin_username || creds.username);
    await page.fill('input[name=password]', creds.admin_password || creds.password);
    await page.press('input[name=password]', 'Enter');
    await page.waitForURL(/#./, {timeout: 30000});
    await page.waitForTimeout(args.wait);

    for (const {name, hash, click} of pages) {
        try {
            await page.evaluate(h => { location.hash = h }, hash);
            await page.waitForTimeout(args.wait);

            // no button: the view is already showing (a module keeps its last view)
            const button = click && page.locator('.neo-button-glyph', {hasText: click}).first();

            if (button && await button.count()) {
                await button.click();
                await page.waitForTimeout(args.wait)
            }

            // what Preferences.applyTheme() does for the dark scheme
            await page.evaluate(() => { document.body.classList.remove('light', 'system'); document.body.classList.add('dark') });
            await page.waitForTimeout(300);

            const elements = await page.evaluate(collectElements),
                  hits     = [];

            elements.forEach((el, index) => {
                const kind = classify(el);
                kind && hits.push({index, kind, el})
            });

            let newOnPage = 0;

            for (const {index, kind, el} of hits) {
                const rule = await page.evaluate(findRule, {index, prop: kind === 'dark-text' ? 'color' : 'background'});

                // background: currentColor with an inline colour = a colour of the user's data (calendar, label)
                if (rule.value === 'currentcolor' && (await page.evaluate(findRule, {index, prop: 'color'})).selector === 'inline style') {
                    counter.dataColours++;
                    continue
                }

                const key = [kind, el.goCls, rule.selector, rule.href].join('|');

                if (!found.has(key)) {
                    found.set(key, {
                        kind, goCls: el.goCls, cls: el.cls, tag: el.tag, text: el.text,
                        colour: kind === 'dark-text' ? el.color + ' on ' + el.effectiveBg : el.bg,
                        selector: rule.selector, value: rule.value, inherited: rule.inherited,
                        origin: ruleOrigin(rule.href, rule.selector), pages: [], count: 0, screenshot: ''
                    });
                    newOnPage++
                }

                const f = found.get(key);
                f.count++;
                f.pages.includes(name) || f.pages.push(name);
                f.screenshot || (f.screenshot = 'screenshots/' + name.replace(/\W+/g, '_') + '.png')
            }

            if (newOnPage) {
                await page.evaluate(ids => ids.forEach(i => document.querySelector(`[data-dark-audit="${i}"]`)?.style.setProperty('outline', '2px solid red', 'important')), hits.map(h => h.index));
                await page.screenshot({path: path.join(shots, name.replace(/\W+/g, '_') + '.png')});
                await page.evaluate(ids => ids.forEach(i => document.querySelector(`[data-dark-audit="${i}"]`)?.style.removeProperty('outline')), hits.map(h => h.index))
            }

            console.log(`${name}: ${elements.length} elements, ${hits.length} flagged, ${newOnPage} new`)
        } catch (e) {
            errors.push(name + ': ' + e.message.split('\n')[0]);
            console.log(`${name}: ERROR ${e.message.split('\n')[0]}`)
        }
    }

    await browser.close();

    return {pages: pages.map(p => p.name).filter(name => !errors.some(e => e.startsWith(name + ': '))), findings: [...found.values()], errors, dataColours: counter.dataColours}
}

function fail(msg) {
    console.error(msg);
    process.exit(2)
}

function parseArgs(argv) {
    const args = {out: path.join(root, 'dist/dark-audit'), credentials: path.join(root, 'test/credentials.local'), wait: 2500},
          valued = ['url', 'out', 'credentials', 'only', 'pages', 'wait', 'playwright', 'modules'];

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i], name = a.slice(2);

        if (a === '--static') args.static = true;
        else if (a.startsWith('--') && valued.includes(name) && argv[i + 1] !== undefined) args[name] = argv[++i];
        else fail(`Unknown or incomplete option ${a}`)
    }

    args.pages && (args.pages = args.pages.split(','));
    args.wait = +args.wait;
    args.only && !['dev', 'modules'].includes(args.only) && fail('--only takes dev or modules');

    return args
}

function report({staticHits, tokenHits, browser}) {
    const lines = ['# Dark mode audit', ''],
          core  = staticHits.filter(h => h.core);

    if (browser) {
        lines.push(`## Rendered (${browser.pages.length} pages, ${browser.findings.length} findings)`, '',
            '| kind | GO class | element | colour | rule | value | origin | pages | screenshot |', '|---|---|---|---|---|---|---|---|---|');

        for (const f of browser.findings.sort((a, b) => a.origin.localeCompare(b.origin))) {
            lines.push(`| ${f.kind} | ${f.goCls} | ${f.tag}.${f.cls.split(/\s+/).slice(0, 3).join('.')} "${f.text}" | ${f.colour} | \`${f.selector}\`${f.inherited ? ' (inherited)' : ''} | \`${f.value}\` | ${f.origin} | ${f.pages.length > 3 ? f.pages.slice(0, 3).join(', ') + ` +${f.pages.length - 3}` : f.pages.join(', ')} (${f.count}×) | ${f.screenshot} |`.replace(/\n/g, ' '))
        }

        lines.push('', `Skipped: ${browser.dataColours} elements coloured by user data (currentColor from an inline colour).`);
        browser.errors.length && lines.push('', 'Pages that failed: ' + browser.errors.join('; '));
        lines.push('')
    }

    lines.push(`## neo tokens without a GO mapping (${tokenHits.length})`, '',
        'Light-only defaults of neo classes GO uses: map them to a GO token in resources/scss/go/<same path>.scss.', '');
    tokenHits.forEach(h => lines.push(`- ${h.file}:${h.line} \`${h.prop}: ${h.value}\``));
    lines.push('');

    const risky = staticHits.filter(h => h.risky);
    lines.push(`## Colour literals (${staticHits.length}: ${core.length} core, ${staticHits.length - core.length} modules; ${risky.length} risky)`, '',
        'Risky: a light background or a dark text colour, wrong in dark mode. The rest (white text on a fixed colour, borders, overlays) reads in both schemes but should be a token.', '');
    [['Risky', risky], ['Fixed colours', staticHits.filter(h => !h.risky)]].forEach(([title, hits]) => {
        lines.push(`### ${title} (${hits.length})`, '');
        hits.forEach(h => lines.push(`- ${h.file}:${h.line} \`${h.prop}: ${h.value}\``));
        lines.push('')
    });

    return lines.join('\n') + '\n'
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    extraPackages = args.modules ? args.modules.split(',').map(d => path.resolve(d)) : [];
    extraPackages.filter(d => !fs.existsSync(d)).forEach(d => fail('--modules: no such directory ' + d));

    const staticHits = staticScan(),
          tokenHits  = neoTokenScan(),
          browser = args.static ? null : args.url ? await browserScan(args) : (console.log('No --url: static part only'), null);

    fs.mkdirSync(args.out, {recursive: true});
    fs.writeFileSync(path.join(args.out, 'report.json'), JSON.stringify({staticHits, tokenHits, browser}, null, 2));
    fs.writeFileSync(path.join(args.out, 'report.md'), report({staticHits, tokenHits, browser}));

    const core = staticHits.filter(h => h.core).length, risky = staticHits.filter(h => h.risky);
    console.log(`neo tokens without a GO mapping: ${tokenHits.length}`);
    console.log(`Colour literals: ${staticHits.length} (${core} core, ${staticHits.length - core} modules), risky: ${risky.length} (${risky.filter(h => h.core).length} core)`);
    browser && console.log(`Rendered: ${browser.pages.length} pages, ${browser.findings.length} findings` + (browser.errors.length ? `, ${browser.errors.length} pages failed` : ''));
    console.log('Report: ' + path.relative(process.cwd(), path.join(args.out, 'report.md')));

    process.exitCode = risky.length || tokenHits.length || browser?.findings.length || browser?.errors.length ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main()
}
