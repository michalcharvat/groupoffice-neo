#!/usr/bin/env node
/**
 * Measures the converter against hand ports (docs/neo-converter-study.md).
 *
 *     node scripts/neo-converter/measure.mjs <amd checkout> [--set a|b|all] [--json [--summary]]
 *
 * For every classic file of a set of modules (--set a: ports, links; b: crew, pms, dms held out; all) it converts the file and compares each config entry the
 * converter wrote (a key of a field, column, store, class config, detail line, registration) with
 * the same entry of the hand port (the neo files PORTING.md maps the classic file to):
 *
 * - same: the same code (whitespace aside)
 * - notation: the same value written differently (quotes, a shared helper such as `...inline` or
 *   `combo(...)`, tCore vs t, the detail record's variable name)
 * - different: another value, or a key only one side has
 * - TODO: classic code the converter left as a TODO block (in classic lines)
 */
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {acorn, convertModule} from './convert.mjs';

/** classic file → hand-ported neo files (views/neo/PORTING.md of each module) */
export const MAPPING = {
    ports: {
        'Module.js'              : ['Index.mjs'],
        'MainPanel.js'           : ['view/PortsMain.mjs'],
        'PortGrid.js'            : ['view/PortsMain.mjs', 'model/Port.mjs'],
        'CountryGrid.js'         : ['view/CountryList.mjs'],
        'CountryDialog.js'       : ['view/CountryDialog.mjs'],
        'PortDialog.js'          : ['view/PortDialog.mjs'],
        'CompanyServiceGrid.js'  : ['view/CompanyServiceGrid.mjs', 'model/CompanyService.mjs'],
        'CompanyServiceDialog.js': ['view/CompanyServiceDialog.mjs'],
        'PortDetail.js'          : ['view/PortDetail.mjs', 'model/Port.mjs'],
        'SettingsDialog.js'      : ['view/settingsLookups.mjs'],
        'SystemSettingsPanel.js' : ['view/SystemSettingsPanel.mjs'],
        'ServiceGrid.js'         : ['view/settingsLookups.mjs'],
        'ServiceDialog.js'       : ['view/settingsLookups.mjs'],
        'UnlocodeGrid.js'        : ['view/UnlocodeListPanel.mjs', 'model/Unlocode.mjs'],
        'UnlocodeCombo.js'       : ['view/UnlocodeCombo.mjs', 'fields.mjs'],
        'PortCombo.js'           : ['fields.mjs'],
        'PortComboReset.js'      : ['fields.mjs'],
        'PortChips.js'           : ['fields.mjs'],
        'CountryCombo.js'        : ['fields.mjs'],
        'ServiceCombo.js'        : ['fields.mjs'],
        'ServiceChips.js'        : ['fields.mjs']
        // customfield/Port.js: not ported yet (PORTING.md row 12, open)
    },
    links: {
        'Module.js'             : ['Index.mjs', 'linkWindow.mjs'],
        'MainPanel.js'          : ['view/LinksMain.mjs'],
        'LinkGrid.js'           : ['view/LinksMain.mjs', 'model/Link.mjs'],
        'CategoryGrid.js'       : ['view/LinksMain.mjs'],
        'CategoryDialog.js'     : ['view/CategoryDialog.mjs'],
        'LinkDialog.js'         : ['view/LinkDialog.mjs'],
        'LinkDetail.js'         : ['view/LinkDetail.mjs', 'model/Link.mjs'],
        'HistoryDetailPanel.js' : ['view/LinkHistoryCard.mjs'],
        'LinkCombo.js'          : ['LinkCombo.mjs'],
        'LinkComboReset.js'     : ['LinkCombo.mjs'],
        'SystemSettingsPanel.js': ['view/SystemSettingsPanel.mjs']
        // GenerateDialog.js: not in PORTING.md (sticker PDF generation, L3)
    }
};

// ---------------------------------------------------------------- config extraction

const keyOf = p => p.key?.type === 'Identifier' ? p.key.name : p.key?.value;

/**
 * @summary Collects the local helpers of a file: `const X = {…}` objects and functions that return an
 * object literal (`const inline = config => ({…, ...config})`, `function combo(entity, …) {return {…}}`).
 */
function helpers(ast) {
    const objects = {}, fns = {};

    (function walk(node) {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
            if (node.init.type === 'ObjectExpression') objects[node.id.name] = node.init;
            if (node.init.type === 'ArrowFunctionExpression') {
                const body = returned(node.init);
                body && (fns[node.id.name] = {params: node.init.params.map(p => p.name ?? p.left?.name), body})
            }
        }
        if (node.type === 'FunctionDeclaration' && node.id) {
            const body = returned(node);
            body && (fns[node.id.name] = {params: node.params.map(p => p.name ?? p.left?.name), body})
        }
        for (const k in node) {
            const v = node[k];
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object' && k !== 'parent') walk(v)
        }
    })(ast);
    return {objects, fns}
}

/** the object literal a function returns, else null */
function returned(fn) {
    if (fn.body.type === 'ObjectExpression') return fn.body;
    if (fn.body.type === 'BlockStatement') {
        const ret = fn.body.body.find(s => s.type === 'ReturnStatement');
        return ret?.argument?.type === 'ObjectExpression' ? ret.argument : null  // shortcut: `return other(...)` is resolved by the factory walk only
    }
    return null
}

/**
 * @summary The entries of an object literal with spreads and helper calls resolved.
 * @param {Object} node ObjectExpression
 * @param {Object} ctx {src, objects, fns}
 * @param {Object} [bind] helper parameter → argument node
 * @param {Boolean} [viaHelper] the entries come from a helper (notation)
 * @returns {Map<String, {code: String, via: Boolean, node: Object}>}
 */
function entries(node, ctx, bind = {}, viaHelper = false) {
    const out = new Map();

    for (const p of node.properties) {
        if (p.type === 'SpreadElement') {
            const arg = p.argument;
            if (arg.type === 'Identifier' && bind[arg.name]) {
                const b = bind[arg.name];
                b.type === 'ObjectExpression' && entries(b, ctx, {}, false).forEach((v, k) => out.set(k, v));
                b.type === 'Resolved' && b.map?.forEach((v, k) => out.set(k, v))
            } else if (arg.type === 'Identifier' && ctx.objects[arg.name]) {
                entries(ctx.objects[arg.name], ctx, {}, true).forEach((v, k) => out.set(k, v))
            }
            continue
        }
        let value = p.value;
        if (value.type === 'Identifier' && bind[value.name]) {
            value = bind[value.name];
            out.set(keyOf(p), {code: ctx.src.slice(value.start, value.end), via: false, node: value});
            continue
        }
        if (value.type === 'Identifier' && ctx.globals?.[value.name]) {
            out.set(keyOf(p), {code: ctx.globals[value.name], via: true, node: value});
            continue
        }
        out.set(keyOf(p), {code: ctx.src.slice(value.start, value.end), via: viaHelper, node: value})
    }
    return out
}

/**
 * @summary Exported and top-level array / object constants of files (PORT_PROPERTIES of model/Port.mjs).
 * @param {String[]} sources
 * @returns {Object<String, String>} name → code
 */
export function constants(sources) {
    const out = {};
    for (const src of sources) {
        const ast = acorn.parse(src, {ecmaVersion: 'latest', sourceType: 'module'});
        for (const stmt of ast.body) {
            const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
            if (decl?.type !== 'VariableDeclaration') continue;
            for (const d of decl.declarations) {
                if (['ArrayExpression', 'Literal'].includes(d.init?.type)) out[d.id.name] = src.slice(d.init.start, d.init.end)
            }
        }
    }
    return out
}

/** a call of a local helper that returns an object: its entries with the arguments bound */
function callEntries(node, ctx) {
    const fn = node.type === 'CallExpression' && node.callee.type === 'Identifier' && ctx.fns[node.callee.name];
    if (!fn) return null;
    // an argument that is itself a helper call (inline({...})) is resolved to its object first
    const args = node.arguments.map(a => a.type === 'CallExpression' && ctx.fns[a.callee?.name] ? {type: 'Resolved', map: callEntries(a, ctx)} : a),
          bind = Object.fromEntries(fn.params.map((p, i) => [p, args[i]]).filter(([, a]) => a));
    return entries(fn.body, ctx, bind, true)
}

/** strips quotes of a literal code */
const unq = code => code?.replace(/^['"`]|['"`]$/g, '');

/**
 * @summary The comparable configs of a neo file: id → entries.
 * Ids: `field:<name>`, `col:<dataField>`, `store:<entity>`, `class:<className>`, `line:<label>`,
 * `factory:<export>`, `registry`, `button:<icon>`.
 * @param {String} src
 * @returns {Object[]} [{id, entries}]
 */
export function extractConfigs(src, globals = {}, file = '') {
    const ast = acorn.parse(src, {ecmaVersion: 'latest', sourceType: 'module'}),
          ctx = {src, globals, ...helpers(ast)},
          out = [],
          seen = new Set();

    const count = {};
    const add = (id, map, node) => {
        if (!id || !map || seen.has(node)) return;
        seen.add(node);
        // a second config of the same id in one file (two portCombo() pickers) gets its own id
        count[id] = (count[id] ?? 0) + 1;
        out.push({id: count[id] > 1 ? `${id}#${count[id]}` : id, entries: map, pos: `${file}:${node.start}`})
    };

    const idOf = map => {
        const v = k => unq(map.get(k)?.code);
        if (map.has('dataField')) return 'col:' + v('dataField');
        if (map.has('columns') && map.has('stateId')) return 'grid:' + v('stateId');

        if (map.has('capability')) return 'registry';
        if (map.has('className')) return 'class:' + v('className');
        if (map.get('module')?.code === 'JmapStore' && map.has('entity')) return 'store:' + v('entity');
        if (map.has('module') && map.has('name')) return 'field:' + v('name');
        if (map.get('module')?.code === 'Button' && map.has('icon')) return 'button:' + v('icon');
        if (map.get('module')?.code === 'ListToolbar') return 'toolbar';
        return null
    };

    (function walk(node, parent) {
        if (!node || typeof node.type !== 'string') return;

        // export const portCombo = config => combo(...) / ({...})
        if (node.type === 'VariableDeclarator' && parent?.type === 'VariableDeclaration' && node.init?.type === 'ArrowFunctionExpression') {
            const body = node.init.body,
                  map  = body.type === 'ObjectExpression' ? entries(body, ctx) : callEntries(body, ctx);
            if (map?.has('module')) {
                add('factory:' + node.id.name, map, body);
                body.type === 'ObjectExpression' && seen.add(body)
            }
        }
        // export function linkCombo(config) {return {...}} / {return linkCombo({...})}
        if (node.type === 'FunctionDeclaration' && node.id && parent?.type === 'ExportNamedDeclaration') {
            const ret = node.body.body.find(s => s.type === 'ReturnStatement')?.argument,
                  map = ret?.type === 'ObjectExpression' ? entries(ret, ctx) : ret && callEntries(ret, ctx);
            if (map?.has('module')) {
                add('factory:' + node.id.name, map, node);
                ret && seen.add(ret)
            }
        }
        // static config = {...}
        if (node.type === 'PropertyDefinition' && node.static && keyOf(node) === 'config' && node.value?.type === 'ObjectExpression') {
            const map = entries(node.value, ctx);
            // a grid class compares with a grid config object of the hand port (by stateId)
            add(map.has('columns') && map.has('stateId') ? 'grid:' + unq(map.get('stateId').code) : 'class:' + unq(map.get('className')?.code), map, node.value)
        }
        // setLines([[t('X'), value], ...])
        if (node.type === 'ArrayExpression' && node.elements.length === 2 && node.elements[0]?.type === 'CallExpression'
            && ['t', 'tCore'].includes(node.elements[0].callee.name) && node.elements[0].arguments[0]?.type === 'Literal'
            && parent?.type === 'ArrayExpression') {
            const v = node.elements[1];
            add('line:' + node.elements[0].arguments[0].value, new Map([['value', {code: src.slice(v.start, v.end), via: false, node: v}]]), node)
        }
        if (node.type === 'ObjectExpression' && !seen.has(node)) {
            const map = entries(node, ctx);
            add(idOf(map), map, node)
        }
        if (node.type === 'CallExpression' && !seen.has(node)) {
            const callee = node.callee.type === 'Identifier' ? node.callee.name : '';
            if (/(Combo|Chips)$/.test(callee) && !ctx.fns[callee]) {
                // a field factory of the module (fields.mjs): compared by the factory and the keys given to it
                const arg = node.arguments[0],
                      map = arg?.type === 'ObjectExpression' ? entries(arg, ctx) : arg ? callEntries(arg, ctx) : new Map();
                add('factory-use:' + callee, map ?? new Map(), node);
                node.arguments.forEach(a => seen.add(a))
            } else {
                const map = callEntries(node, ctx);
                if (map) {
                    add(idOf(map), map, node);
                    node.arguments.forEach(a => a.type === 'ObjectExpression' && seen.add(a))
                }
            }
        }
        for (const k in node) {
            const v = node[k];
            if (Array.isArray(v)) v.forEach(c => walk(c, node));
            else if (v && typeof v === 'object' && typeof v.type === 'string') walk(v, node)
        }
    })(ast, null);

    return out
}

// ---------------------------------------------------------------- comparison

/** whitespace and trailing commas aside */
const normA = c => c.replace(/\s+/g, ' ').replace(/,\s*([}\]])/g, '$1').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

/** notation aside: quotes, tCore, the record's variable name, `?? '-'` vs `|| '-'`, numbers as strings */
const normB = c => normA(c).replace(/"/g, "'").replace(/\btCore\(/g, 't(').replace(/\b(record|link|port|values|me\.data)\./g, 'R.')
    .replace(/\s*([:,=?|])\s*/g, '$1').replace(/^'(\d+)'$/, '$1');

/**
 * @summary Compares converter configs with hand-port configs.
 * @returns {{same, notation, different, extra, missing, unmatched, rows: Object[]}}
 */
export function compare(converted, hand, consumed = new Set()) {
    // a hand config already credited to another classic file of the module is not credited twice
    const pool = hand.filter(h => !consumed.has(h.pos)),
          res  = {same: 0, notation: 0, different: 0, extra: 0, missing: 0, unmatched: 0, matchedHand: 0, rows: []};

    for (const c of converted) {
        // factory uses are compared under their field id when the hand port names the same field
        const i = pool.findIndex(h => h.id === c.id || (c.id.startsWith('factory') && h.id === c.id.replace('factory-use', 'factory')));
        if (i < 0) {
            res.unmatched += c.entries.size;
            res.rows.push({id: c.id, verdict: 'unmatched', keys: [...c.entries.keys()]});
            continue
        }
        const h = pool.splice(i, 1)[0];
        consumed.add(h.pos);
        res.matchedHand += h.entries.size;

        for (const [k, v] of c.entries) {
            const hv = h.entries.get(k);
            let verdict;
            if (!hv) verdict = 'extra';
            else if (normA(v.code) === normA(hv.code)) verdict = hv.via || v.via ? 'notation' : 'same';
            else if (normB(v.code) === normB(hv.code)) verdict = 'notation';
            else verdict = 'different';
            res[verdict]++;
            res.rows.push({id: c.id, key: k, verdict, converted: normA(v.code).slice(0, 70), hand: hv && normA(hv.code).slice(0, 70)})
        }
        for (const k of h.entries.keys()) {
            if (!c.entries.has(k)) {
                res.missing++;
                res.rows.push({id: c.id, key: k, verdict: 'missing', hand: normA(h.entries.get(k).code).slice(0, 70)})
            }
        }
    }
    return res
}

// ---------------------------------------------------------------- held-out set

/** set (a): the prototype's modules (MAPPING); set (b): held-out hand ports the rules were not tuned on */
export const SETS = {a: ['ports', 'links'], b: ['crew', 'pms', 'dms']};

/**
 * @summary Classic file → hand-ported neo files of a held-out module, by name only (fixed before any
 * step 2 rule was written, so the rules cannot shape it): Module.js → Index.mjs, MainPanel.js →
 * view/*Main.mjs, X.js → X.mjs / view/X.mjs, a combo or chips also → the module's fields.mjs, a grid or
 * detail also → model/<X without Grid/Detail>.mjs, SettingsDialog.js → view/lookups.mjs. A classic
 * file without such a neo file is not measured (not ported, or ported under another name).
 * @param {String} neoDir views/neo of the module
 * @param {String[]} classic classic files below views/extjs3
 * @returns {Object<String, String[]>}
 */
export function autoMapping(neoDir, classic) {
    const have = f => existsSync(join(neoDir, f)),
          main = existsSync(join(neoDir, 'view')) ? readdirSync(join(neoDir, 'view')).filter(f => /Main\.mjs$/.test(f)).map(f => 'view/' + f) : [],
          out  = {};

    for (const file of classic) {
        const base = file.replace(/\.js$/, '').split('/').pop();
        let targets;
        if (file === 'Module.js') targets = ['Index.mjs'];
        else if (file === 'MainPanel.js') targets = main;
        else if (file === 'SettingsDialog.js') targets = ['view/lookups.mjs'];
        else {
            targets = [base + '.mjs', 'view/' + base + '.mjs'];
            /(Combo|ComboReset|Chips)$/.test(base) && targets.push('fields.mjs', 'view/fields.mjs');
            /(Grid|Detail)$/.test(base) && targets.push('model/' + base.replace(/(Grid|Detail)$/, '') + '.mjs')
        }
        targets = targets.filter(have);
        // a combo found only fields.mjs: measured (the factory lives there); anything else needs its own file
        if (targets.length && (targets.some(t => !/fields\.mjs$|^model\//.test(t)) || /(Combo|ComboReset|Chips)$/.test(base))) out[file] = targets
    }
    return out
}

/** kinds of classic files in the summary; combo and chips together as in the study */
const KIND = k => ({chips: 'combo', unknown: 'no rule', other: 'no rule', error: 'no rule'})[k] ?? k;

/**
 * @summary Measures modules: per classic file the comparison, per kind and in total the shares.
 * @param {String} amd amd checkout
 * @param {String[]} modules
 * @returns {{files: Object[], kinds: Object, total: Object, coverage: Object[]}}
 */
export function measure(amd, modules) {
    const files = [], handByKind = {}, coverage = [];

    for (const name of modules) {
        const neoDir   = join(amd, name, 'views/neo'),
              results  = convertModule(join(amd, name)),
              mapping  = MAPPING[name] ?? autoMapping(neoDir, results.map(r => r.file)),
              consumed = new Set();
        for (const r of results) {
            const targets = mapping[r.file];
            if (!targets) continue;
            const handFiles = targets.filter(f => existsSync(join(neoDir, f))),
                  handSrc = handFiles.map(f => readFileSync(join(neoDir, f), 'utf8')),
                  globals = constants(handSrc),
                  hand    = handSrc.flatMap((src, i) => extractConfigs(src, globals, `${name}/${handFiles[i]}`));
            const cmp = compare(extractConfigs(r.code), hand, consumed);
            const kinds = {};
            r.todos.forEach(t => kinds[t.kind] = (kinds[t.kind] ?? 0) + t.lines);
            const kind = KIND(r.kind);
            handByKind[kind] ??= new Map();
            hand.forEach(h => handByKind[kind].set(h.pos, h.entries.size));
            files.push({module: name, file: r.file, kind: r.kind, classicLines: r.classicLines, todoLines: r.todoLines,
                todoBlocks: r.todos.length, todoKinds: kinds, outLines: r.code.split('\n').filter(l => l.trim()).length,
                handLines: handSrc.reduce((n, src) => n + src.split('\n').filter(l => l.trim()).length, 0),
                ...cmp})
        }

        // the whole hand port: every config entry the measure recognises in every neo file of the module
        const all   = readdirSync(neoDir, {recursive: true}).filter(f => f.endsWith('.mjs') && !f.startsWith('dev/')),
              srcs  = all.map(f => readFileSync(join(neoDir, f), 'utf8')),
              glob  = constants(srcs),
              total = srcs.flatMap(src => extractConfigs(src, glob)).reduce((n, c) => n + c.entries.size, 0),
              hit   = files.filter(r => r.module === name).reduce((n, r) => n + r.same + r.notation, 0);
        coverage.push({module: name, files: all.length, lines: srcs.reduce((n, src) => n + src.split('\n').filter(l => l.trim()).length, 0), total, hit})
    }

    const sumOf = rows => {
        const s = k => rows.reduce((n, r) => n + r[k], 0),
              out = Object.fromEntries(['classicLines', 'todoLines', 'same', 'notation', 'different', 'extra', 'missing', 'unmatched'].map(k => [k, s(k)]));
        out.files = rows.length;
        out.written = out.same + out.notation + out.different + out.extra + out.unmatched;
        return out
    };
    const kinds = {};
    for (const r of files) (kinds[KIND(r.kind)] ??= []).push(r);
    for (const k in kinds) {
        kinds[k] = sumOf(kinds[k]);
        kinds[k].handEntries = [...handByKind[k].values()].reduce((n, v) => n + v, 0)
    }
    const total = sumOf(files);
    // a hand file mapped from classic files of two kinds (PortGrid and MainPanel → PortsMain) counts once
    total.handEntries = [...new Map(Object.values(handByKind).flatMap(m => [...m])).values()].reduce((n, v) => n + v, 0);
    return {files, kinds, total, coverage}
}

const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';

// ---------------------------------------------------------------- run

if (process.argv[1]?.endsWith('measure.mjs')) {
    const amd  = process.argv[2],
          json = process.argv.includes('--json'),
          set  = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'a',
          res  = measure(amd, set === 'all' ? [...SETS.a, ...SETS.b] : SETS[set]);

    if (json) {
        console.log(JSON.stringify(process.argv.includes('--summary') ? {kinds: res.kinds, total: res.total, coverage: res.coverage} : res, null, 1));
    } else {
        const cols = ['same', 'notation', 'different', 'extra', 'missing', 'unmatched'];
        console.log('module file                               kind      classic todo  ' + cols.map(c => c.padStart(9)).join(''));
        for (const r of res.files) {
            console.log(`${r.module.padEnd(6)} ${r.file.padEnd(35)} ${r.kind.padEnd(9)} ${String(r.classicLines).padStart(7)} ${String(r.todoLines).padStart(4)}  ${cols.map(c => String(r[c]).padStart(9)).join('')}`)
        }
        console.log(`TOTAL ${' '.repeat(46)}${String(res.total.classicLines).padStart(7)} ${String(res.total.todoLines).padStart(4)}  ${cols.map(c => String(res.total[c]).padStart(9)).join('')}`);

        const kinds = {};
        res.files.forEach(r => Object.entries(r.todoKinds).forEach(([k, n]) => kinds[k] = (kinds[k] ?? 0) + n));
        console.log('\nTODO classic lines by kind (a line can count in two blocks):');
        Object.entries(kinds).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));

        console.log('\nBy kind: hit = same + notation; of hand = hit / config entries of the mapped hand files; of written = hit / entries the converter wrote');
        console.log('kind       files classic  TODO   TODO %   hit  of hand  of written  different');
        for (const [k, v] of [...Object.entries(res.kinds), ['TOTAL', res.total]]) {
            const hit = v.same + v.notation;
            console.log(`${k.padEnd(10)} ${String(v.files).padStart(5)} ${String(v.classicLines).padStart(7)} ${String(v.todoLines).padStart(5)} ${pct(v.todoLines, v.classicLines).padStart(8)} ${String(hit).padStart(5)} ${pct(hit, v.handEntries).padStart(8)} ${pct(hit, v.written).padStart(11)} ${String(v.different).padStart(10)}`)
        }

        console.log('\nHand port coverage (the config entries the measure recognises in every neo file of the module):');
        for (const c of res.coverage) console.log(`  ${c.module.padEnd(6)} ${c.files} files, ${c.lines} lines, ${c.total} config entries; converter same or notation: ${c.hit} (${pct(c.hit, c.total)})`)
    }
}
