#!/usr/bin/env node
/**
 * ExtJS (views/extjs3) → neo (views/neo) converter, prototype (docs/neo-converter-study.md).
 *
 *     node scripts/neo-converter/convert.mjs <module dir> [--out <dir>] [--package amd]
 *
 * Converts every file of <module dir>/views/extjs3 (scripts.txt order) by the rules of rules.mjs and
 * writes <out>/view/<Name>.mjs (Module.js → <out>/Index.mjs). What no rule covers is kept as a
 * `TODO(neo-converter)` comment with the original code. Without --out it prints a summary only.
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as R from './rules.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @summary A file of the GroupOffice checkout, searched upwards: a git worktree has no node_modules
 * and no built Paper CSS, its ancestors reach the main checkout.
 * @param {String} path relative to the checkout
 * @returns {String} absolute path
 */
function findUp(path) {
    for (let dir = resolve(here, '../..'); dir !== dirname(dir); dir = dirname(dir)) {
        if (existsSync(join(dir, path))) return join(dir, path)
    }
    throw new Error(`${path} not found (npm install in www/views/neo; the Paper theme is built CSS)`)
}

export const acorn = await import(pathToFileURL(findUp('www/views/neo/node_modules/acorn/dist/acorn.mjs')).href);

/** classic icon aliases that are no ic-* class */
const ICON_ALIASES = {'btn-print': 'print'};

/**
 * @summary The classic ic-* → Material glyph map: the Paper theme, then the module's own themes.
 * @param {String} [moduleDir]
 * @returns {Object<String, String>}
 */
export function loadIconMap(moduleDir) {
    const files = [findUp('www/views/Extjs3/themes/Paper/style.css')];

    if (moduleDir && existsSync(join(moduleDir, 'themes'))) {
        for (const theme of readdirSync(join(moduleDir, 'themes'))) {
            const css = join(moduleDir, 'themes', theme, 'style.css');
            existsSync(css) && files.push(css)
        }
    }

    const map = {};
    for (const file of files) {
        for (const m of readFileSync(file, 'utf8').matchAll(/\.(ic-[a-z0-9_-]+):+before\s*\{\s*content\s*:\s*["']([^"']+)["']/g)) {
            map[m[1]] = m[2]
        }
    }
    return map
}

// ---------------------------------------------------------------- printing

const IND = '    ';

/** a single-quoted JS string */
const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/** raw code */
const raw = code => ({type: 'raw', code});

/** an object: [[key, value], ...] */
const obj = entries => ({type: 'obj', entries});

/** a TODO comment with the original code (inside arrays, objects and class bodies) */
const todo = (kind, reason, original) => ({type: 'todo', kind, reason, original});

/**
 * @summary Prints a value of the intermediate form as code.
 * @param {*} v string (code), {type: raw|obj|arr|call|todo|arrow}
 * @param {String} ind current indent
 * @returns {String}
 */
function print(v, ind = '') {
    if (typeof v === 'string') return v;
    // a value without a rule (valueCode() null) prints as null: valid code, visible in review
    if (v === null || v === undefined) return 'null';

    const inner = ind + IND;

    switch (v.type) {
        case 'raw':
            return v.code;
        case 'obj': {
            const entries = v.entries.filter(e => e);
            if (!entries.length) return '{}';
            const width = Math.max(...entries.filter(e => !e.type).map(([k]) => k.length), 0);
            const lines = entries.map((e, i) => {
                if (e.type === 'todo') return printTodo(e, inner);
                const comma = entries.slice(i + 1).some(x => !x.type) ? ',' : '';
                if (e[0].startsWith('...')) return inner + e[0] + comma;
                return `${inner}${e[0].padEnd(width)}: ${print(e[1], inner)}${comma}`
            });
            return `{\n${lines.join('\n')}\n${ind}}`
        }
        case 'arr': {
            const items = v.items.filter(e => e);
            if (!items.length) return '[]';
            if (items.every(i => typeof i === 'string') && items.join(', ').length < 80) return `[${items.join(', ')}]`;
            const lines = items.map((e, i) => {
                if (e.type === 'todo') return printTodo(e, inner);
                const comma = items.slice(i + 1).some(x => x.type !== 'todo') ? ',' : '';
                return inner + print(e, inner) + comma
            });
            return `[\n${lines.join('\n')}\n${ind}]`
        }
        case 'call':
            return `${v.callee}(${v.args.map(a => print(a, ind)).join(', ')})`;
        case 'arrow':
            return `${v.params} => (${print(v.body, ind)})`;
        case 'todo':
            return printTodo(v, ind);
    }
    throw new Error('unknown value ' + JSON.stringify(v))
}

/**
 * @summary A TODO block: one marker line and the original code in a block comment.
 * @param {Object} t todo
 * @param {String} ind
 * @returns {String}
 */
function printTodo(t, ind) {
    const head = `${ind}// TODO(neo-converter) [${t.kind}] ${t.reason}`;
    if (!t.original) return head;
    const body = dedent(t.original).replace(/\*\//g, '*\\/').split('\n').map(l => ind + '//   ' + l);
    return [head, ...body].join('\n')
}

/** removes the common indent of a snippet (its first line has none, it starts at the node) */
function dedent(text) {
    const lines = text.split('\n'),
          rest  = lines.slice(1).filter(l => l.trim()),
          min   = rest.length ? Math.min(...rest.map(l => l.match(/^\s*/)[0].length)) : 0,
          // the first line starts at the node: its own indent is the last line's (closing brace) one
          shift = Math.max(0, min - (lines.length > 1 ? lines.at(-1).match(/^\s*/)[0].length : 0));
    return [lines[0], ...lines.slice(1).map(l => l.slice(Math.min(min - shift, l.match(/^\s*/)[0].length)))].join('\n')
}

// ---------------------------------------------------------------- conversion

/**
 * @summary One classic file being converted: its source, the imports and TODOs it collects.
 */
class FileContext {
    /**
     * @param {String} src classic source
     * @param {Object} module {pkg, name, iconMap, classes: {classic name → {kind, factory}}, xtypes}
     */
    constructor(src, module) {
        this.src     = src;
        this.module  = module;
        this.imports = new Map();   // local name → import rule
        this.helpers = new Set();   // generated local helpers
        this.defined = new Set();   // factories this file exports itself (no import of them)
        this.todos   = [];          // {kind, reason, start, end}
    }

    /** source text of a node */
    code(node) {
        return this.src.slice(node.start, node.end)
    }

    /** registers a neo import by its rules.mjs name and returns the local name */
    use(name) {
        this.imports.set(name, R.IMPORTS[name] ?? name);
        return name
    }

    /**
     * @summary A TODO for a classic node; its kind follows the TODO_KINDS patterns unless given.
     * @param {Object} node acorn node
     * @param {String} reason
     * @param {String} [kind]
     * @returns {Object} todo value
     */
    todo(node, reason, kind) {
        const original = this.code(node);
        kind ??= R.TODO_KINDS.find(([, re]) => re.test(original))?.[0] ?? 'no rule';
        this.todos.push({kind, reason, start: node.start, end: node.end});
        return todo(kind, reason, original)
    }
}

/** key name of a Property node */
const keyOf = p => p.key?.type === 'Identifier' ? p.key.name : p.key?.value;

/** dotted name of a MemberExpression / Identifier ('go.form.Dialog'), else null */
function dotted(node) {
    if (!node) return null;
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'ThisExpression') return 'this';
    if (node.type === 'MemberExpression' && !node.computed) {
        const left = dotted(node.object);
        return left && left + '.' + node.property.name
    }
    return null
}

/** the Property nodes of an ObjectExpression by key */
const props = node => node?.type === 'ObjectExpression' ? node.properties.filter(p => p.type === 'Property') : [];
const prop  = (node, key) => props(node).find(p => keyOf(p) === key)?.value;

/**
 * @summary A classic value as neo code, or null when it needs a rule it has not (a function, Ext.*).
 * t('X', 'module', 'package') → t('X') (translator of the module), dp(n) → n.
 * @param {FileContext} ctx
 * @param {Object} node
 * @returns {String|null}
 */
function valueCode(ctx, node) {
    switch (node?.type) {
        case 'Literal':
            return typeof node.value === 'string' ? q(node.value) : node.raw;
        case 'Identifier':
            return ['undefined'].includes(node.name) ? node.name : null;
        case 'UnaryExpression':
            return node.argument.type === 'Literal' ? ctx.code(node) : null;
        case 'MemberExpression':
        {
            // go.permissionLevels.write → LEVEL_WRITE of core src/Acl.mjs
            const level = R.PERMISSION_LEVELS[/^go\.permissionLevels\.(\w+)$/.exec(dotted(node))?.[1]];
            return level ? ctx.use(level) : null
        }
        case 'CallExpression': {
            const callee = dotted(node.callee);
            if (callee === 't' && node.arguments[0]?.type === 'Literal') return `t(${q(node.arguments[0].value)})`;
            if (callee === 'dp' && node.arguments[0]?.type === 'Literal') return String(node.arguments[0].value);
            return null
        }
        case 'ArrayExpression': {
            const items = node.elements.map(e => e && valueCode(ctx, e));
            return items.every(i => i !== null) ? `[${items.join(', ')}]` : null
        }
        case 'ObjectExpression': {
            const entries = props(node).map(p => [keyOf(p), valueCode(ctx, p.value)]);
            return entries.every(([, v]) => v !== null) && node.properties.every(p => p.type === 'Property')
                ? `{${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}}` : null
        }
    }
    return null
}

/** 'ic-edit' / 'entity ic-link' / 'btn-print' → Material glyph, else null */
function glyph(ctx, iconCls) {
    for (const cls of String(iconCls).split(/\s+/)) {
        const g = ctx.module.iconMap[cls] ?? ICON_ALIASES[cls];
        if (g) return g
    }
    return null
}

/**
 * @summary Converts the keys of a classic config by a key table.
 * @param {FileContext} ctx
 * @param {Object[]} properties Property nodes
 * @param {Object} table rules.mjs key table
 * @param {Object} [skip] keys handled by the caller
 * @returns {Array} entries and todos
 */
function convertKeys(ctx, properties, table, skip = {}) {
    const out = [];

    for (const p of properties) {
        if (p.type !== 'Property') {
            out.push(ctx.todo(p, 'spread in a classic config'));
            continue
        }

        const key = keyOf(p);
        if (skip[key]) continue;

        if (key === 'iconCls') {
            const g = glyph(ctx, p.value.value);
            out.push(g ? ['icon', q(g)] : ctx.todo(p, `icon class ${p.value.value} has no glyph`, 'icon'));
            continue
        }

        const rule = table[key];
        if (rule === undefined || rule === null) {
            out.push(ctx.todo(p, `config key "${key}" has no rule`, key === 'listeners' ? 'listeners / events' : undefined));
            continue
        }

        const value = valueCode(ctx, p.value);
        if (value === null) {
            out.push(ctx.todo(p, `value of "${key}" is code`));
            continue
        }

        if (typeof rule === 'function') out.push(...rule(value, p, properties));
        else out.push([rule, value])
    }
    return out
}

/** lowerCamel factory name of a classic class: PortComboReset → portComboReset */
const factoryName = cls => cls.split('.').pop().replace(/^./, c => c.toLowerCase());

/**
 * @summary Converts a list of form items (initFormItems' array, a fieldset's items).
 * @param {FileContext} ctx
 * @param {Object[]} nodes
 * @param {Object} [opts] {inline: true} adds the inline label of a top-level dialog field
 * @returns {Array}
 */
function convertItems(ctx, nodes, opts = {inline: true}) {
    const out = [];
    for (const node of nodes) {
        const item = convertItem(ctx, node, opts);
        if (item?.type === 'spread') out.push(...item.items);
        else if (item) out.push(item)
    }
    return out
}

/**
 * @summary One form item: an xtype object, `new X({...})` or `this.x = <item>`.
 * @param {FileContext} ctx
 * @param {Object} node
 * @param {Object} opts
 * @returns {Object} value, todo or {type: 'spread', items}
 */
function convertItem(ctx, node, opts) {
    const resolved = resolveLocal(ctx, node);
    if (resolved !== node) {
        // this.x = <item>: the reference keeps the name
        const item = convertItem(ctx, resolved, opts), ref = dotted(node)?.replace(/^(me|this)\./, '');
        node.type === 'MemberExpression' && item?.type === 'obj' && item.entries.splice(1, 0, ['reference', q(ref)]);
        return item
    }
    // new Ext.form.TextField({...}) reads like {xtype: 'textfield', ...}
    if (node.type === 'NewExpression' && R.CLASS_XTYPES[dotted(node.callee)] && (node.arguments[0]?.type === 'ObjectExpression' || !node.arguments.length)) {
        const cfg = node.arguments[0] ?? {type: 'ObjectExpression', properties: []};
        return convertItem(ctx, {...cfg, properties: [{type: 'Property', key: {type: 'Identifier', name: 'xtype'}, value: {type: 'Literal', value: R.CLASS_XTYPES[dotted(node.callee)]}}, ...cfg.properties]}, opts)
    }
    if (node.type === 'AssignmentExpression' && dotted(node.left)?.startsWith('this.')) {
        // this.unlocode = new ...: the reference keeps the name
        const item = convertItem(ctx, node.right, opts);
        item?.type === 'obj' && item.entries.splice(1, 0, ['reference', q(node.left.property.name)]);
        return item
    }

    if (node.type === 'NewExpression') {
        const cls  = dotted(node.callee),
              cfg  = node.arguments[0],
              core = R.CORE_CLASSES[cls];

        if (core) {
            const drop = Object.fromEntries((core.drop ?? []).map(k => [k, true]));
            return obj([['module', ctx.use(core.module)], ...withInline(convertKeys(ctx, props(cfg), R.FIELD_KEYS, drop), opts),
                ...Object.entries(core.defaults)])
        }

        const local = ctx.module.classes[cls] ?? ctx.module.registry?.classes[cls];
        if (local?.factory) return factoryCall(ctx, local, withInline(convertKeys(ctx, props(cfg), R.FIELD_KEYS), opts))
        return ctx.todo(node, `class ${cls} has no rule`)
    }

    if (node.type !== 'ObjectExpression') return ctx.todo(node, 'form item is code');

    const xtype = prop(node, 'xtype')?.value;

    if (xtype === 'fieldset') {
        const items = convertItems(ctx, prop(node, 'items')?.elements ?? [], opts),
              title = prop(node, 'title'),
              rest  = props(node).filter(p => !['xtype', 'items', 'title', 'defaults', 'labelWidth'].includes(keyOf(p)));
        rest.forEach(p => items.push(ctx.todo(p, `fieldset key "${keyOf(p)}" has no rule`)));
        // a fieldset without a title only groups: neo dialogs list its fields directly
        if (!title) return {type: 'spread', items};
        ctx.use('fieldset');
        return {type: 'call', callee: 'fieldset', args: [valueCode(ctx, title) ?? ctx.todo(title, 'fieldset title is code'), {type: 'arr', items}]}
    }

    if (xtype === 'container' || (!xtype && prop(node, 'items')?.type === 'ArrayExpression')) return convertContainer(ctx, node, opts);
    if (xtype === 'selectfield') return convertSelectField(ctx, node, opts);
    if (xtype === 'combo') return convertLocalCombo(ctx, node, opts);
    if (xtype === 'formgroup') return convertFormGroup(ctx, node);

    // Ext's form and fieldset defaultType: an item with a name and no xtype is a text field
    const module = R.FIELD_XTYPES[xtype ?? (prop(node, 'name') || prop(node, 'fieldLabel') ? 'textfield' : '')];
    if (module) {
        const entries = convertKeys(ctx, props(node), R.FIELD_KEYS, {xtype: true});
        return obj([['module', ctx.use(module)], ...withInline(entries, opts, module === 'BoolCheckBox')])
    }

    const local = ctx.module.xtypes[xtype] ?? ctx.module.registry?.xtypes[xtype];
    if (local?.factory) return factoryCall(ctx, local, withInline(convertKeys(ctx, props(node), R.FIELD_KEYS, {xtype: true}), opts))
    return ctx.todo(node, xtype ? `xtype "${xtype}" has no rule` : 'form item without xtype')
}

/**
 * @summary A call of a combo / chips factory: the module's own ('../fields.mjs') or another module's
 * (registry). A Reset combo with a plain sibling calls the sibling with `clearable: true`.
 */
function factoryCall(ctx, local, entries) {
    const fn = local.callAs ?? local.factory;
    ctx.imports.set(fn, [local.from ? '../../../../../' + local.from : '../fields.mjs', fn]);
    return {type: 'call', callee: fn, args: [obj(local.callAs ? [['clearable', 'true'], ...entries] : entries)]}
}

/** adds labelPosition 'inline' and flex 'none' (the house style of a dialog field) */
function withInline(entries, opts, checkbox = false) {
    if (!opts.inline) return entries;
    return [...entries, ...(checkbox ? [] : [['labelPosition', "'inline'"]]), ['flex', "'none'"]]
}

/**
 * @summary A classic container in a form: without a layout (or 'form' / 'anchor') it only groups and its
 * items join the parent; a 'column' / 'hbox' layout becomes an hbox container, columnWidth → flex.
 */
function convertContainer(ctx, node, opts) {
    const layout = prop(node, 'layout'),
          kind   = layout?.type === 'Literal' ? layout.value : layout?.type === 'ObjectExpression' ? prop(layout, 'type')?.value : undefined,
          elems  = prop(node, 'items')?.type === 'ArrayExpression' ? prop(node, 'items').elements : null,
          rest   = props(node).filter(p => !['xtype', 'items', 'layout', 'defaults', 'labelWidth', 'anchor', 'border', 'cls', 'columnWidth', 'flex'].includes(keyOf(p)));

    if (!elems) return ctx.todo(node, 'container items are code');
    if (kind === undefined || kind === 'form' || kind === 'anchor') {
        return {type: 'spread', items: [...convertItems(ctx, elems, opts), ...rest.map(p => ctx.todo(p, `container key "${keyOf(p)}" has no rule`))]}
    }
    if (kind !== 'column' && kind !== 'hbox') return ctx.todo(node, `container layout "${kind}" has no rule`);

    // a column that groups fields (a container without layout) is a vbox of them
    const column = list => obj([['ntype', "'container'"], ['layout', "{ntype: 'vbox', align: 'stretch'}"], ['items', {type: 'arr', items: list}]]);
    const items = elems.map(e => {
        const flex = valueCode(ctx, prop(e, 'columnWidth') ?? prop(e, 'flex')) ?? '1';
        let item = convertItem(ctx, e, opts);
        if (item?.type === 'spread') item = column(item.items);
        if (item?.type !== 'obj') return item;
        item.entries = item.entries.filter(x => x.type || x[0] !== 'flex');
        item.entries.push(['flex', flex]);
        return item
    });
    return obj([['ntype', "'container'"], ['layout', "{ntype: 'hbox', align: 'start'}"], ['flex', "'none'"], ['items', {type: 'arr', items}],
        ...rest.map(p => ctx.todo(p, `container key "${keyOf(p)}" has no rule`))])
}

/** go.form.SelectField {options: [[value, label], ...]} → SelectField */
function convertSelectField(ctx, node, opts) {
    const options = prop(node, 'options'),
          list    = options?.type === 'ArrayExpression' && options.elements.every(e => e.type === 'ArrayExpression' && e.elements.length === 2)
              ? options.elements.map(e => `{value: ${valueCode(ctx, e.elements[0])}, text: ${valueCode(ctx, e.elements[1])}}`) : null;
    if (!list || list.some(o => o.includes('null'))) return ctx.todo(node, 'selectfield options are code', 'store handling');
    return obj([['module', ctx.use('SelectField')], ...withInline(convertKeys(ctx, props(node), R.FIELD_KEYS, {xtype: true, options: true}), opts),
        ['options', {type: 'arr', items: list}]])
}

/**
 * @summary A classic combo over a local ArrayStore ([[value, label], ...]) → SelectField.
 */
function convertLocalCombo(ctx, node, opts) {
    const store = prop(node, 'store'),
          data  = store?.type === 'NewExpression' && dotted(store.callee) === 'Ext.data.ArrayStore' && prop(store.arguments[0], 'data');

    if (!data || data.type !== 'ArrayExpression' || !data.elements.every(e => e.type === 'ArrayExpression' && e.elements.length === 2)) {
        return ctx.todo(node, 'combo without a literal ArrayStore', 'store handling')
    }

    const label   = n => n.type === 'Literal' ? q(String(n.value)) : valueCode(ctx, n),
          options = data.elements.map(e => `{value: ${valueCode(ctx, e.elements[0])}, text: ${label(e.elements[1])}}`);
    if (options.some(o => o.includes('null'))) return ctx.todo(node, 'combo option is code', 'store handling');
    const
          skip  = {xtype: true, store: true, valueField: true, displayField: true};

    return obj([['module', ctx.use('SelectField')], ...withInline(convertKeys(ctx, props(node), R.FIELD_KEYS, skip), opts),
        ['options', {type: 'arr', items: options}]])
}

/**
 * @summary go.form.FormGroup (rows of fields, Add button) → ArrayField of ContainerField rows with a
 * remove button, then an add button.
 */
function convertFormGroup(ctx, node) {
    const name    = prop(node, 'name'),
          itemCfg = prop(node, 'itemCfg'),
          btnCfg  = prop(node, 'btnCfg'),
          rows    = convertItems(ctx, prop(itemCfg, 'items')?.elements ?? [], {inline: false}),
          ref     = name.value;

    ['ArrayField', 'ContainerField', 'Button'].forEach(m => ctx.use(m));

    // a row's empty value: every named field of the row
    const empty = (prop(itemCfg, 'items')?.elements ?? []).map(e => prop(e, 'name')?.value).filter(Boolean)
        .map(n => `${n}: ${n === 'id' ? 'null' : "''"}`).join(', ');

    return {type: 'spread', items: [obj([
        ['module', 'ArrayField'],
        ['name', q(ref)],
        ['reference', q(ref)],
        ['flex', "'none'"],
        ['buildField', {type: 'arrow', params: '()', body: obj([
            ['module', 'ContainerField'],
            ['layout', "{ntype: 'hbox', align: 'center'}"],
            ['items', {type: 'arr', items: [...rows, 'ArrayField.removeButton({flex: \'none\'})']}]
        ])}]
    ]), obj([
        ['module', 'Button'],
        ['ui', "'secondary'"],
        ...convertKeys(ctx, props(btnCfg), {text: 'text'}),
        ['flex', "'none'"],
        ['handler', raw(`() => this.getReference(${q(ref)}).addValue({${empty}})`)]
    ])]}
}

// ---------------------------------------------------------------- classes

/**
 * @summary Kebab case of a class name: CategoryDialog → category-dialog.
 */
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * @summary The methods of an Ext.extend body that no rule took, as TODOs.
 */
function restAsTodos(ctx, members, handled) {
    return members.filter(p => !handled.has(p)).map(p => ctx.todo(p, `${keyOf(p)} has no rule`))
}

/** statements that only plumb the classic super call or `me` */
function isPlumbing(ctx, stmt) {
    const text = ctx.code(stmt);
    return /^(const|var|let) me = this;?$/.test(text) || /(supr\(\)|superclass)\.initComponent\.call/.test(text)
        || /\.superclass\.constructor\.call/.test(text)
}

/**
 * @summary go.form.Dialog → GO.view.FormWindow.
 */
function convertDialog(ctx, name, members) {
    const handled = new Set(),
          config  = [['className', q(`GO.${ctx.module.name}.view.${name}`)],
                     ['cls', `['go-form-window', 'go-${ctx.module.name}-${kebab(name)}']`]];
    let items = [], width = null, height = null;
    const pre = [], cards = [];

    for (const p of members) {
        const key = keyOf(p);
        if (key === 'width') width = valueCode(ctx, p.value);
        if (key === 'height') height = valueCode(ctx, p.value);
        if (key in R.DIALOG_KEYS) {
            handled.add(p);
            config.push(...convertKeys(ctx, [p], R.DIALOG_KEYS))
        }
        if (key === 'initFormItems' && p.value.type === 'FunctionExpression') {
            handled.add(p);
            // `var x = …` / `this.x = …` items the returned array refers to (form items, not run code)
            ctx.locals = {};
            const later = [];
            for (const stmt of p.value.body.body) {
                const local = formLocal(stmt);
                if (local) ctx.locals[local.key] = {node: local.node, stmt, used: false};
                else later.push(stmt)
            }
            for (const stmt of later) {
                const ret = stmt.type === 'ReturnStatement' && resolveLocal(ctx, stmt.argument);
                if (ret?.type === 'ArrayExpression') items = convertItems(ctx, ret.elements);
                else if (isPlumbing(ctx, stmt)) continue;
                else if (!addPanel(ctx, stmt, cards)) pre.push(ctx.todo(stmt, 'initFormItems statement (classic addPanel → neo addCard())'))
            }
            Object.values(ctx.locals).filter(l => !l.used).forEach(l => pre.push(ctx.todo(l.stmt, 'initFormItems statement')));
            ctx.locals = null
        }
    }

    // properties: id and every named field the form submits
    const names = ['id', ...new Set(collectNames(items))];
    config.splice(3, 0, ['properties', `[${names.map(q).join(', ')}]`]);

    if (width && height) {
        config.push(['wrapperStyle', `{height: 'min(${height}px, 90vh)', left: 'max(0px, calc(50vw - ${width / 2}px))', top: 'max(5vh, calc(50vh - ${height / 2}px))', width: 'min(${width}px, 100vw)'}`])
    }

    ctx.use('FormWindow');
    return [
        `class ${name} extends FormWindow {`,
        `${IND}static config = ${print(obj(config), IND)}`,
        '',
        `${IND}createFormItems() {`,
        `${IND}${IND}return ${print({type: 'arr', items}, IND + IND)}`,
        `${IND}}`,
        ...(cards.length ? [
            '',
            `${IND}onConstructed() {`,
            `${IND}${IND}// the cards exist from here on`,
            `${IND}${IND}const result = super.onConstructed();`,
            ...cards.map(c => c === 'share' ? `${IND}${IND}this.addSharePanel();` : `${IND}${IND}this.addCard(${print(c, IND + IND)});`),
            `${IND}${IND}return result`,
            `${IND}}`
        ] : []),
        ...classTodos(ctx, [...pre, ...restAsTodos(ctx, members, handled)]),
        '}'
    ].join('\n')
}

/**
 * @summary A statement of initFormItems that only names a form item: `var x = <item>` or
 * `this.x = <item>` / `me.x = <item>` with an object or `new` item.
 * @returns {{key: String, node: Object}|null} key 'x' or 'this.x'
 */
function formLocal(stmt) {
    const item = n => ['ObjectExpression', 'NewExpression', 'ArrayExpression'].includes(n?.type);
    if (stmt.type === 'VariableDeclaration' && stmt.declarations.length === 1 && stmt.declarations[0].id.type === 'Identifier'
        && item(stmt.declarations[0].init)) return {key: stmt.declarations[0].id.name, node: stmt.declarations[0].init};
    const e = stmt.expression;
    if (e?.type === 'AssignmentExpression' && e.operator === '=' && /^(me|this)\.\w+$/.test(dotted(e.left) ?? '') && item(e.right)) {
        return {key: dotted(e.left).replace(/^me\./, 'this.'), node: e.right}
    }
    return null
}

/** an item that is a local of initFormItems (x, this.x, me.x) → its value node, marked used; else the node */
function resolveLocal(ctx, node) {
    const key = node && (node.type === 'Identifier' ? node.name : node.type === 'MemberExpression' ? dotted(node)?.replace(/^me\./, 'this.') : null),
          local = key && ctx.locals?.[key];
    if (!local || local.used) return node;
    local.used = true;
    return local.node
}

/**
 * @summary `this.addPanel(new go.permissions.SharePanel())` → addSharePanel(), `this.addPanel({title,
 * items})` → addCard() of converted items (both in onConstructed()).
 * @returns {Boolean} handled
 */
function addPanel(ctx, stmt, cards) {
    const e = stmt.expression;
    if (e?.type !== 'CallExpression' || !/^(me|this)\.addPanel$/.test(dotted(e.callee) ?? '')) return false;
    const arg = resolveLocal(ctx, e.arguments[0]);
    if (arg?.type === 'NewExpression' && dotted(arg.callee) === 'go.permissions.SharePanel') {
        cards.push('share');
        return true
    }
    if (arg?.type === 'ObjectExpression' && prop(arg, 'items')?.type === 'ArrayExpression' && !prop(arg, 'xtype')) {
        const title = prop(arg, 'title'),
              rest  = props(arg).filter(p => !['title', 'items', 'layout', 'autoScroll', 'defaults', 'labelWidth'].includes(keyOf(p)));
        cards.push(obj([
            ...(title ? [['header', `{text: ${valueCode(ctx, title) ?? 'null'}}`]] : []),
            ['items', {type: 'arr', items: convertItems(ctx, prop(arg, 'items').elements)}],
            ...rest.map(p => ctx.todo(p, `card key "${keyOf(p)}" has no rule`))
        ]));
        return true
    }
    return false
}

/** names of the form fields in converted items (ArrayField rows excluded: their names are the row's) */
function collectNames(items) {
    const names = [];
    for (const item of items) {
        if (item?.type === 'obj') {
            const n = item.entries.find(e => e[0] === 'name'), sub = item.entries.find(e => e[0] === 'items');
            n && typeof n[1] === 'string' && names.push(n[1].replace(/^'|'$/g, ''));
            sub?.[1]?.type === 'arr' && names.push(...collectNames(sub[1].items))
        } else if (item?.type === 'call') {
            item.args.forEach(a => a.type === 'arr' ? names.push(...collectNames(a.items))
                : a.type === 'obj' && names.push(...collectNames([a])))
        }
    }
    return names
}

/** TODOs of a class body, each as a commented block */
function classTodos(ctx, todos) {
    return todos.length ? ['', ...todos.map(t => printTodo(t, IND))] : []
}

/**
 * @summary go.grid.GridPanel → GO.grid.Grid with a JmapStore. With a classic `tbar` the class becomes a
 * container: a core ListToolbar (tbsearch → searchFilters, Add → endItems, ⋮ → moreItems) over the grid.
 * initComponent's locals (`var tbar = [...]`, `var selModel = …`, `var actions = this.initRowActions()`)
 * are read where the config uses them; the standard row menu (initRowActions + showMoreMenu with Edit /
 * Delete) becomes core `entityActions` and `Grid.rowMenuColumn()`.
 */
function convertGrid(ctx, name, members) {
    const handled = new Set(),
          config  = [],
          todos   = [],
          locals  = {},     // initComponent `var x = …` → {node, stmt, used}
          st      = {tbar: null, multi: false, dialog: null, rowMenu: false, menuExtras: []};

    // a local of initComponent the config refers to (tbar: tbar, selModel: selModel)
    const resolve = node => {
        const local = node?.type === 'Identifier' && locals[node.name];
        if (!local) return node;
        local.used = true;
        return local.node
    };

    const takeConfig = properties => {
        for (const p of properties) {
            const key = keyOf(p), value = resolve(p.value);
            if (key === 'columns' && value.type === 'ArrayExpression') config.push(['columns', {type: 'arr', items: value.elements.map(c => gridColumn(ctx, c, locals, st))}]);
            else if (key === 'store') config.push(...storeEntry(ctx, value));
            else if (key === 'viewConfig') config.push(...convertViewConfig(ctx, value));
            else if (key === 'autoExpandColumn' || key === 'stateId') config.push([key, valueCode(ctx, value)]);
            else if (key === 'stateful' || key === 'multiSelectToolbarEnabled') { /* neo grids keep state by stateId; ListToolbar has the multi select toolbar */ }
            else if (key === 'tbar' && value.type === 'ArrayExpression') st.tbar = value;
            else if ((key === 'selModel' || key === 'sm') && selectionMulti(value) !== null) st.multi = selectionMulti(value);
            else if (key === 'plugins' && value.type === 'ArrayExpression' && value.elements.every(e => isRowActions(e, locals))) { /* the row ⋮: entityActions */ }
            else todos.push(ctx.todo(p, `grid key "${key}" has no rule`))
        }
    };

    for (const p of members) {
        const key = keyOf(p);
        if (key === 'initComponent' && p.value.type === 'FunctionExpression') {
            handled.add(p);
            for (const stmt of p.value.body.body) {
                const expr = stmt.expression;
                if (isPlumbing(ctx, stmt)) continue;
                if (stmt.type === 'VariableDeclaration' && stmt.declarations.length === 1 && stmt.declarations[0].init) {
                    const d = stmt.declarations[0];
                    locals[d.id.name] = {node: d.init, stmt, used: isRowActionsInit(d.init)};
                    isRowActionsInit(d.init) && (st.rowMenu = true);
                } else if (expr?.type === 'AssignmentExpression' && /^(me|this)\.store$/.test(dotted(expr.left))) {
                    config.push(...storeEntry(ctx, expr.right))
                } else if (expr?.type === 'AssignmentExpression' && /^(me|this)\.editDialogClass$/.test(dotted(expr.left)) && dotted(expr.right)) {
                    st.dialog = dotted(expr.right)
                } else if (expr?.type === 'CallExpression' && ['Ext.apply', 'Ext.applyIf'].includes(dotted(expr.callee)) && /^(me|this)$/.test(dotted(expr.arguments[0]))
                    && expr.arguments[1]?.type === 'ObjectExpression') {
                    takeConfig(props(expr.arguments[1]))
                } else todos.push(ctx.todo(stmt, 'initComponent statement'))
            }
        } else if (['columns', 'store', 'viewConfig', 'autoExpandColumn', 'stateId', 'stateful', 'multiSelectToolbarEnabled', 'tbar', 'selModel', 'sm'].includes(key)) {
            handled.add(p);
            takeConfig([p])
        } else if (key === 'editDialogClass' && dotted(p.value)) {
            handled.add(p);
            st.dialog = dotted(p.value)
        }
    }
    // the standard row menu: initRowActions() and showMoreMenu() with Edit / Delete
    for (const p of members) {
        const key = keyOf(p);
        if (key === 'initRowActions' && st.rowMenu && /Ext\.ux\.grid\.RowActions/.test(ctx.code(p.value)) && /showMoreMenu/.test(ctx.code(p.value))) handled.add(p);
        if (key === 'showMoreMenu' && st.rowMenu) {
            const menu = rowMenu(ctx, p.value);
            if (menu) {
                handled.add(p);
                st.dialog ??= menu.dialog;
                st.menuExtras = menu.extras
            }
        }
    }
    // locals no config read: their statement stays a TODO
    Object.values(locals).filter(l => !l.used).forEach(l => todos.push(ctx.todo(l.stmt, 'initComponent statement')));

    st.multi && config.unshift(['multiSelect', 'true']);
    if (st.rowMenu || st.dialog) {
        const actions = [];
        st.dialog && actions.push(['dialog', `() => import(${q(dialogPath(ctx, st.dialog))})`]);
        st.menuExtras.length && actions.push(['rowMenuItems', raw('(record, {edit, delete: del}) => [edit, del]')], ...st.menuExtras);
        config.push(['entityActions', obj(actions)])
    }

    ctx.use('Grid');
    if (!st.tbar) {
        return [
            `class ${name} extends Grid {`,
            `${IND}static config = ${print(obj([['className', q(`GO.${ctx.module.name}.view.${name}`)], ...config]), IND)}`,
            ...classTodos(ctx, [...todos, ...restAsTodos(ctx, members, handled)]),
            '}'
        ].join('\n')
    }

    const tb = listToolbar(ctx, st.tbar);
    ctx.use('Container');
    return [
        `class ${name} extends Container {`,
        `${IND}static config = ${print(obj([['className', q(`GO.${ctx.module.name}.view.${name}`)], ['layout', "{ntype: 'vbox', align: 'stretch'}"]]), IND)}`,
        '',
        `${IND}construct(config) {`,
        `${IND}${IND}super.construct(config);`,
        '',
        `${IND}${IND}const me = this;`,
        '',
        `${IND}${IND}me.items = ${print({type: 'arr', items: [tb.toolbar, obj([['module', 'Grid'], ['reference', "'grid'"], ['flex', '1'], ...config])]}, IND + IND)}`,
        `${IND}}`,
        '',
        `${IND}onConstructed() {`,
        `${IND}${IND}super.onConstructed();`,
        `${IND}${IND}this.getReference('listToolbar').setGrid(this.getReference('grid'))`,
        `${IND}}`,
        ...tb.methods,
        ...classTodos(ctx, [...todos, ...restAsTodos(ctx, members, handled)]),
        '}'
    ].join('\n')
}

/** `this.initRowActions()`: the classic row ⋮ column */
const isRowActionsInit = node => node?.type === 'CallExpression' && /^(me|this)\.initRowActions$/.test(dotted(node.callee));

/** a column / plugin entry that is the row actions local */
const isRowActions = (node, locals) => node?.type === 'Identifier' && isRowActionsInit(locals[node.name]?.node);

/**
 * @summary A classic selection model: true for multi select (CheckboxSelectionModel, RowSelectionModel
 * without singleSelect), false for single select, null when it is not one of those.
 */
function selectionMulti(node) {
    if (node?.type !== 'NewExpression') return null;
    const cls = dotted(node.callee), single = prop(node.arguments[0], 'singleSelect');
    if (cls === 'Ext.grid.CheckboxSelectionModel') return single?.value !== true;
    if (cls === 'Ext.grid.RowSelectionModel') return single?.value !== true;
    return null
}

/** a grid column; the selection model's checkbox column goes (multiSelect), the row actions become the core ⋮ */
function gridColumn(ctx, node, locals, st) {
    if (node.type === 'Identifier' && isRowActions(node, locals)) return 'Grid.rowMenuColumn()';
    const local = node.type === 'Identifier' && locals[node.name];
    if (local && selectionMulti(local.node) !== null) {
        local.used = true;
        return null
    }
    return convertColumn(ctx, node)
}

/**
 * @summary showMoreMenu(): a menu of Edit (opens a dialog class) and Delete is core entityActions;
 * other items stay TODOs for rowMenuItems.
 * @returns {{dialog: String|null, extras: Object[]}|null} null when it is no such menu
 */
function rowMenu(ctx, fn) {
    let items = null;
    (function walk(n) {
        if (!n || typeof n.type !== 'string' || items) return;
        if (n.type === 'NewExpression' && dotted(n.callee) === 'Ext.menu.Menu') items = prop(n.arguments[0], 'items');
        for (const k in n) {
            const v = n[k];
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object' && k !== 'parent') walk(v)
        }
    })(fn.body);
    if (items?.type !== 'ArrayExpression') return null;

    let dialog = null;
    const extras = [];
    for (const item of items.elements) {
        const id = prop(item, 'itemId')?.value, icon = prop(item, 'iconCls')?.value;
        if (id === 'edit' || icon === 'ic-edit') {
            dialog = /new\s+([\w.]+Dialog)\s*\(/.exec(ctx.code(item))?.[1] ?? null
        } else if (id === 'delete' || icon === 'ic-delete') {
            // core deletes after a confirmation
        } else if (!(item.type === 'Literal' && item.value === '-')) {
            extras.push(ctx.todo(item, 'row menu item: add it in rowMenuItems', 'handler'))
        }
    }
    return {dialog, extras}
}

/** import path of a dialog class: the module's own view, or another module's (registry) */
function dialogPath(ctx, cls) {
    const m = /^go\.modules\.(\w+)\.(\w+)\.(\w+)$/.exec(cls);
    if (!m || m[2] === ctx.module.name) return `./${cls.split('.').pop()}.mjs`;
    return `../../../../../${m[1]}/${m[2]}/views/neo/view/${m[3]}.mjs`
}

/** 'modifiedat' / 'nameWoDiacritics' → 'Modified at' / 'Name wo diacritics' */
const titleOf = name => {
    const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(modified|created)(at)$/i, '$1 $2').toLowerCase();
    return words[0].toUpperCase() + words.slice(1)
};

/**
 * @summary A classic grid tbar → core ListToolbar: tbsearch filters → searchFilters, items before '->'
 * → startItems, an Add button → endItems (its handler a TODO in onAdd()), the ⋮ menu → moreItems
 * (Export → the core export item and exportFormats).
 * @returns {{toolbar: Object, methods: String[]}}
 */
function listToolbar(ctx, arr) {
    ctx.use('ListToolbar');
    const entries = [['module', 'ListToolbar'], ['reference', "'listToolbar'"], ['flex', "'none'"]],
          start = [], end = [], methods = [];
    let right = false, search = null, more = null, formats = [];

    const button = node => node.type === 'AssignmentExpression' ? button(node.right)
        : node.type === 'NewExpression' && dotted(node.callee) === 'Ext.Button' ? node.arguments[0]
        : node.type === 'ObjectExpression' && (!prop(node, 'xtype') || prop(node, 'xtype').value === 'button') ? node : null;

    for (const node of arr.elements) {
        if (node.type === 'Literal' && node.value === '->') { right = true; continue }
        if (node.type === 'Literal' && node.value === '-') continue;
        const xtype = node.type === 'ObjectExpression' && prop(node, 'xtype')?.value;
        if (xtype === 'tbsearch') {
            const filters = prop(node, 'filters');
            search = filters?.type === 'ArrayExpression' ? filters.elements.map(f => searchFilter(ctx, f)) : [ctx.todo(node, 'tbsearch without a filters list')];
            continue
        }
        if (xtype === 'tbtitle' && valueCode(ctx, prop(node, 'text'))) {
            ctx.use('TableTitle');
            start.push(obj([['module', 'TableTitle'], ['title', valueCode(ctx, prop(node, 'text'))]]));
            continue
        }
        const cfg = button(node), icon = cfg && prop(cfg, 'iconCls')?.value;
        if (cfg && /\bic-add\b/.test(icon ?? '')) {
            ctx.use('Button');
            end.push(obj([['module', 'Button'], ['icon', "'add'"], ['ui', "'primary'"], ['reference', "'addButton'"],
                ['tooltip', valueCode(ctx, prop(cfg, 'tooltip')) ?? "t('Add')"], ['handler', raw('() => me.onAdd()')]]));
            const handler = props(cfg).find(p => keyOf(p) === 'handler');
            methods.push('', `${IND}onAdd() {`, ...(handler ? [printTodo(ctx.todo(handler, 'Add handler', 'handler'), IND + IND)] : []), `${IND}}`);
            continue
        }
        if (cfg && /\bic-more-vert\b/.test(icon ?? '') && prop(cfg, 'menu')?.type === 'ArrayExpression') {
            more = prop(cfg, 'menu').elements.map(item => {
                if (item.type === 'Literal' && item.value === '-') return '{separator: true}';
                const code = ctx.code(item), fmt = /exportToFile\([\s\S]*?['"](\w+)['"]\s*\)\s*;?\s*\}/.exec(code);
                if (/exportToFile/.test(code)) {
                    formats.push(fmt?.[1] ?? 'csv');
                    return 'exp'
                }
                const g = glyph(ctx, prop(item, 'iconCls')?.value ?? ''), text = valueCode(ctx, prop(item, 'text'));
                return obj([...(text ? [['text', text]] : []), ...(g ? [['icon', q(g)]] : []), ctx.todo(item, 'more menu item handler', 'handler')])
            });
            continue
        }
        (right ? end : start).push(ctx.todo(node, 'toolbar item has no rule'))
    }

    entries.push(['searchFilters', search ? {type: 'arr', items: search} : 'null']);
    formats.length && entries.push(['exportFormats', `[${[...new Set(formats)].map(q).join(', ')}]`]);
    start.length && entries.push(['startItems', {type: 'arr', items: start}]);
    end.length && entries.push(['endItems', {type: 'arr', items: end}]);
    more && entries.push(['moreItems', {type: 'arrow', params: formats.length ? '({export: exp})' : '()', body: {type: 'arr', items: more}}]);
    return {toolbar: obj(entries), methods}
}

/** a tbsearch filter: 'text' → the core Query filter, a name → a string (or date) filter of that name */
function searchFilter(ctx, node) {
    if (node.type !== 'Literal' || typeof node.value !== 'string') return valueCode(ctx, node) ?? ctx.todo(node, 'tbsearch filter is code');
    const name = node.value;
    if (name === 'text') return "{name: 'text', type: 'string', multiple: false, title: t('Query')}";
    const date = /^(modified|created)(at)?$/i.test(name);
    return `{name: ${q(name)}, type: '${date ? 'date' : 'string'}', multiple: ${!date}, title: t(${q(titleOf(name))})}`
}

/** a grid column; checkcolumn / datecolumn get a renderer of their own */
function convertColumn(ctx, node) {
    if (node.type !== 'ObjectExpression') return ctx.todo(node, 'column is code');

    const xtype   = prop(node, 'xtype')?.value,
          entries = convertKeys(ctx, props(node), R.COLUMN_KEYS, {xtype: true, renderer: true}),
          renderer = props(node).find(p => keyOf(p) === 'renderer');

    if (xtype === 'checkcolumn') {
        ctx.helpers.add('checkRenderer');
        entries.push(['renderer', 'checkRenderer'])
    } else if (xtype === 'datecolumn') {
        ctx.helpers.add('dateTimeRenderer');
        entries.push(['cellAlign', "'right'"], ['renderer', 'dateTimeRenderer'])
    } else if (xtype) {
        entries.push(ctx.todo(prop(node, 'xtype'), `column xtype "${xtype}" has no rule`))
    }
    renderer && entries.push(ctx.todo(renderer, 'column renderer', 'renderer'));
    return obj(entries)
}

/** the grid's store entry; a store without a rule is null next to its TODO (a comment is no value) */
function storeEntry(ctx, node) {
    const store = convertStore(ctx, node);
    return store.type === 'todo' ? [['store', 'null'], store] : [['store', store]]
}

/** go.data.Store / {xtype: 'gostore'} → JmapStore config */
function convertStore(ctx, node) {
    const cfg = node.type === 'NewExpression' && dotted(node.callee) === 'go.data.Store' ? node.arguments[0]
        : node.type === 'ObjectExpression' ? node : null;

    if (!cfg) return ctx.todo(node, 'store is code', 'store handling');

    const entries = [['module', ctx.use('JmapStore')]];
    for (const p of props(cfg)) {
        const key = keyOf(p);
        if (key === 'xtype') continue;
        if (key === 'entityStore') entries.push(['entity', valueCode(ctx, p.value)]);
        else if (key === 'fields' && p.value.type === 'ArrayExpression') {
            // relation fields (creator, modifier) are read by neo renderers, not loaded as properties
            const names = p.value.elements.map(f => f.type === 'Literal' ? f.value
                : prop(f, 'type')?.value === 'relation' ? null : prop(f, 'name')?.value).filter(Boolean);
            entries.push(['properties', `[${names.map(q).join(', ')}]`]);
            p.value.elements.filter(f => prop(f, 'type')?.value === 'relation')
                .forEach(f => entries.push(ctx.todo(f, 'relation field: read the related entity in a renderer', 'store handling')))
        } else if (key === 'sortInfo') {
            entries.push(['sorters', sortersCode(ctx, p.value)])
        } else entries.push(ctx.todo(p, `store key "${key}" has no rule`, 'store handling'))
    }
    return obj(entries)
}

/** viewConfig: emptyText '<i>icon</i><p>' + t('Text') + '</p>' → emptyText + emptyIcon */
function convertViewConfig(ctx, node) {
    const out = [];
    for (const p of props(node)) {
        const key = keyOf(p);
        // neo has no scroll bar offset and fills the width itself (Grid column sizing)
        if (['totalDisplay', 'scrollOffset', 'autoFill'].includes(key)) continue;
        if (key === 'forceFit' && p.value.value === true) {
            out.push(['forceFit', 'true']);
            continue
        }
        if (key !== 'emptyText') {
            out.push(ctx.todo(p, `viewConfig key "${key}" has no rule`));
            continue
        }
        const parts = flatConcat(p.value),
              icon  = parts.map(x => x.type === 'Literal' && /<i>([^<]+)<\/i>/.exec(x.value)?.[1]).find(Boolean),
              text  = parts.find(x => x.type === 'CallExpression' && dotted(x.callee) === 't');
        text ? out.push(['emptyText', valueCode(ctx, text)]) : out.push(ctx.todo(p, 'emptyText is HTML'));
        icon && out.push(['emptyIcon', q(icon)])
    }
    return out
}

/** the parts of a + concatenation */
function flatConcat(node) {
    return node.type === 'BinaryExpression' && node.operator === '+' ? [...flatConcat(node.left), ...flatConcat(node.right)] : [node]
}

/**
 * @summary go.detail.Panel → GO.detail.Panel: XTemplate panels → LinesCards filled in renderRecord(),
 * add*() calls → core cards, the standard toolbar → core's.
 */
function convertDetail(ctx, name, members) {
    const handled = new Set(),
          config  = [['className', q(`GO.${ctx.module.name}.view.${name}`)], ['cls', `['go-${ctx.module.name}-detail']`]],
          cards   = [],
          body    = [],
          fills   = [],
          todos   = [];
    let deletes = false;

    const takeItems = arr => {
        for (const item of arr.elements) {
            const tpl = item.type === 'ObjectExpression' && prop(item, 'tpl');
            if (tpl) {
                const ref   = `card${body.length + 1}`,
                      lines = templateLines(ctx, tpl);
                ctx.use('LinesCard');
                body.push(obj([['module', 'LinesCard'], ['reference', q(ref)], ['title', valueCode(ctx, prop(item, 'title')) ?? "''"]]));
                fills.push({ref, lines})
            } else todos.push(ctx.todo(item, 'detail item without a template'))
        }
    };

    for (const p of members) {
        const key = keyOf(p);
        if (key in R.DETAIL_KEYS && R.DETAIL_KEYS[key] !== null) {
            handled.add(p);
            config.push(...convertKeys(ctx, [p], R.DETAIL_KEYS))
        } else if (key === 'initComponent') {
            handled.add(p);
            for (const stmt of p.value.body.body) {
                const expr = stmt.expression, text = ctx.code(stmt);
                if (isPlumbing(ctx, stmt) || /^(me|this)\.tbar = (me|this)\.initToolbar\(\);?$/.test(text)) continue;
                const call = expr?.type === 'CallExpression' && dotted(expr.callee);
                if (call && R.DETAIL_CARDS[call.split('.').pop()] && /^(me|this)\./.test(call)) cards.push(q(R.DETAIL_CARDS[call.split('.').pop()]));
                else if (call === 'Ext.apply' && prop(expr.arguments[1], 'items')?.type === 'ArrayExpression') {
                    takeItems(prop(expr.arguments[1], 'items'));
                    props(expr.arguments[1]).filter(x => keyOf(x) !== 'items').forEach(x => todos.push(ctx.todo(x, `detail key "${keyOf(x)}" has no rule`)))
                } else if (expr?.type === 'AssignmentExpression' && /^(me|this)\.items$/.test(dotted(expr.left)) && expr.right.type === 'ArrayExpression') {
                    takeItems(expr.right)
                } else todos.push(ctx.todo(stmt, 'initComponent statement'))
            }
        } else if (key === 'initToolbar') {
            handled.add(p);
            const extra = toolbarExtras(ctx, p.value);
            deletes = extra.deletes;
            todos.push(...extra.todos)
        }
    }

    cards.length && config.push(['cards', `[${cards.join(', ')}]`]);

    const render = fills.length ? [
        '',
        `${IND}createBody() {`,
        `${IND}${IND}return ${print({type: 'arr', items: body}, IND + IND)}`,
        `${IND}}`,
        '',
        `${IND}renderRecord(record) {`,
        `${IND}${IND}const me = this;`,
        '',
        `${IND}${IND}if (!record) {`,
        ...fills.map(f => `${IND}${IND}${IND}me.getReference(${q(f.ref)}).setLines(null);`),
        `${IND}${IND}${IND}return`,
        `${IND}${IND}}`,
        '',
        ...fills.map(f => `${IND}${IND}me.getReference(${q(f.ref)}).setLines(${print({type: 'arr', items: f.lines}, IND + IND)});`),
        `${IND}}`
    ] : [];

    ctx.use('Panel');
    return [
        `class ${name} extends Panel {`,
        `${IND}static config = ${print(obj(config), IND)}`,
        ...render,
        ...(deletes ? ['', `${IND}onDelete() {`, `${IND}${IND}this.deleteRecord()`, `${IND}}`] : []),
        ...classTodos(ctx, [...todos, ...restAsTodos(ctx, members, handled)]),
        '}'
    ].join('\n')
}

/**
 * @summary initToolbar(): the standard buttons are core's; every other item is a TODO.
 * @returns {{deletes: Boolean, todos: Object[]}}
 */
function toolbarExtras(ctx, fn) {
    const todos = [];
    let deletes = false;

    const visit = node => {
        if (!node) return;
        if (node.type === 'ArrayExpression') return node.elements.forEach(visit);
        if (node.type === 'Literal' && ['->', '-'].includes(node.value)) return;
        if (node.type === 'AssignmentExpression') return visit(node.right);
        if (node.type === 'NewExpression') {
            const cls = dotted(node.callee);
            if (R.CORE_DETAIL_BUTTONS.includes(cls)) return;
            if (cls === 'Ext.menu.Item' || cls === 'Ext.Button') return visit(node.arguments[0]);
            return todos.push(ctx.todo(node, `toolbar class ${cls} has no rule`))
        }
        if (node.type === 'ObjectExpression') {
            const id    = prop(node, 'itemId')?.value ?? prop(node, 'xtype')?.value ?? '',
                  icon  = prop(node, 'iconCls')?.value ?? '',
                  menu  = prop(node, 'menu');
            if (menu && /more-vert/.test(icon)) return visit(menu);
            if (R.CORE_DETAIL_BUTTONS.includes(id) || /^(ic-edit|ic-delete|btn-print|ic-print)$/.test(icon)) {
                deletes ||= id === 'delete' || icon === 'ic-delete';
                return
            }
            return todos.push(ctx.todo(node, `toolbar item ${id || icon} has no core counterpart`))
        }
        todos.push(ctx.todo(node, 'toolbar item is code'))
    };

    for (const stmt of fn.body.body) {
        const text = ctx.code(stmt);
        if (stmt.type === 'VariableDeclaration' && /this\.tbar \|\| \[\]/.test(text)) continue;
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'AssignmentExpression'
            && stmt.expression.right.type === 'CallExpression' && /\.concat$/.test(dotted(stmt.expression.right.callee))) {
            stmt.expression.right.arguments.forEach(visit);
            continue
        }
        if (stmt.type === 'ReturnStatement' && /new Ext\.Toolbar\(\{\s*disabled: true,\s*items: items\s*\}\)/.test(text)) continue;
        todos.push(ctx.todo(stmt, 'initToolbar statement'))
    }
    return {deletes, todos}
}

/**
 * @summary An XTemplate's rows ('<p><label>X</label><span>{a}</span></p>' or
 * '<tr><td>X:</td><td>{a:htmlEncode}</td></tr>') → LinesCard lines [t('X'), record.a || '-'].
 * A row with code ({[...]}, <tpl if>) stays a TODO with its template text.
 */
function templateLines(ctx, tplNode) {
    if (tplNode.type !== 'NewExpression' || dotted(tplNode.callee) !== 'Ext.XTemplate') return [ctx.todo(tplNode, 'tpl is not an XTemplate')];

    // the template text; t('X') calls become {[t("X")]} so both notations read alike
    let text = '';
    const flat     = tplNode.arguments.flatMap(flatConcat),
          segments = [],   // {from, to, node}: which classic node wrote which part of the text
          members  = [];
    for (const part of flat) {
        let piece;
        // t("X", "module", "package") inside the text reads like t("X")
        if (part.type === 'Literal' && typeof part.value === 'string') piece = part.value.replace(/\{\[t\((["'])([^"']+)\1[^\]]*?\)\]\}/g, '{[t("$2")]}');
        else if (part.type === 'CallExpression' && dotted(part.callee) === 't') piece = `{[t("${part.arguments[0].value}")]}`;
        else if (part.type === 'ObjectExpression') {
            members.push(ctx.todo(part, 'XTemplate member functions'));
            continue
        } else piece = '{[?]}';
        segments.push({from: text.length, to: text.length + piece.length, node: part});
        text += piece
    }

    const lines = [],
          ROW   = /<p\b[^>]*>[\s\S]*?<\/p>|<tr>[\s\S]*?<\/tr>/g;

    const add = (row, cond, at) => {
        const label  = /\{\[t\("([^"]+)"\)\]\}/.exec(row)?.[1],
              value  = row.replace(/\{\[t\("[^"]+"\)\]\}:?/, '').replace(/<[^>]+>/g, '').trim(),
              simple = value.match(/^\{(\w+)(:htmlEncode)?\}$/),
              multi  = /^(?:[^{}[\]]*\{\w+(?::htmlEncode)?\})+[^{}[\]]*$/.test(value);

        if (!label) return;
        // {[expr]} without Ext / this: values.x → record.x, an outer htmlEncode() goes (LinesCard escapes text)
        const code = value.match(/^\{\[([\s\S]*)\]\}$/)?.[1]?.trim().replace(/^Ext\.util\.Format\.htmlEncode\(([\s\S]*)\)$/, '$1');
        // a related entity may be missing (values.country.name → record.country?.name)
        if (code && !cond && !/Ext\.|this\.|go\.|GO\.|\{\[/.test(code)) {
            return lines.push(`[t(${q(label)}), ${code.replace(/\bvalues\./g, 'record.').replace(/\b(record\.\w+)\.(?=\w)/g, '$1?.')}]`)
        }
        if (simple && !cond) return lines.push(`[t(${q(label)}), record.${simple[1]} || '-']`);
        if (multi && !cond) return lines.push(`[t(${q(label)}), \`${value.replace(/\{(\w+)(:htmlEncode)?\}/g, "${record.$1 ?? ''}")}\`]`);
        const reason = cond ? `conditional row "${label}" (<tpl if>)` : `row "${label}" is code`;
        lines.push(todo('template (XTemplate)', reason, row));
        // the classic lines of the row: the template parts its text came from
        ctx.todos.push({kind: 'template (XTemplate)', reason, nodes: segments.filter(g => g.from < at + row.length && g.to > at).map(g => g.node)})
    };

    for (const m of text.matchAll(/<tpl if="[^"]*">([\s\S]*?)<\/tpl>|<p\b[^>]*>[\s\S]*?<\/p>|<tr>[\s\S]*?<\/tr>/g)) {
        if (m[1] !== undefined) {
            const base = m.index + m[0].indexOf(m[1]);
            [...m[1].matchAll(ROW)].forEach(r => add(r[0], true, base + r.index))
        } else add(m[0], false, m.index)
    }
    return [...lines, ...members]
}

/**
 * @summary go.form.ComboBox / go.form.ComboBoxReset / go.form.Chips subclass → an exported field config
 * factory. A Reset combo is clearable (neo's default), a plain one is not (rules.mjs PLAIN_COMBO_CLEARABLE). A use of
 * a Reset combo with a plain sibling calls the sibling's factory with `clearable: true` (factoryCall()).
 * initComponent's `Ext.apply(this, {store})` / `this.store = …` is read like a store member.
 */
function convertCombo(ctx, name, members, kind, base) {
    const entries = [['module', ctx.use(kind === 'chips' ? 'AutocompleteChips' : 'JmapComboBox')]],
          todos   = [],
          fn      = factoryName(name);

    ctx.defined.add(fn);
    const takeStore = s => {
        if (s.type === 'NewExpression' && dotted(s.callee) === 'go.data.Store') s = s.arguments[0];
        if (s?.type !== 'ObjectExpression') return todos.push(ctx.todo(s, 'store is code', 'store handling'));
        prop(s, 'entityStore') && entries.push(['entity', valueCode(ctx, prop(s, 'entityStore'))]);
        prop(s, 'sortInfo') && entries.push(['jmapSort', sortCode(ctx, prop(s, 'sortInfo'))]);
        for (const x of props(s)) {
            const key = keyOf(x);
            if (['xtype', 'fields', 'entityStore', 'sortInfo', 'autoLoad', 'remoteSort'].includes(key)) continue;   // the combo loads and sorts on the server itself
            if (key === 'baseParams' && x.value.type === 'ObjectExpression') entries.push(...baseParams(ctx, x.value));
            else if (key === 'filters') entries.push(...storeFilters(ctx, x));
            else todos.push(ctx.todo(x, `store key "${key}" has no rule`, 'store handling'))
        }
    };

    for (const p of members) {
        const key = keyOf(p);
        if (key === 'entityStore') entries.push(['entity', valueCode(ctx, p.value)]);
        else if (key === 'store') takeStore(p.value);
        else if (key === 'comboStoreConfig' && prop(p.value, 'sortInfo')) {
            entries.push(['jmapSort', sortCode(ctx, prop(p.value, 'sortInfo'))])
        } else if (key === 'displayField' || key === 'valueField') {
            entries.push([key, valueCode(ctx, p.value)])
        } else if (key === 'initComponent' && p.value.type === 'FunctionExpression') {
            for (const stmt of p.value.body.body) {
                const expr = stmt.expression;
                if (isPlumbing(ctx, stmt) || /^(\w+\.)+superclass\.initComponent\.(call|apply)\(this(, arguments)?\);?$/.test(ctx.code(stmt))
                    || /^this\.supr\(\)\.initComponent\.(call|apply)\(this(, arguments)?\);?$/.test(ctx.code(stmt))) continue;
                if (expr?.type === 'AssignmentExpression' && dotted(expr.left) === 'this.store') takeStore(expr.right);
                else if (expr?.type === 'CallExpression' && dotted(expr.callee) === 'Ext.apply' && dotted(expr.arguments[0]) === 'this'
                    && props(expr.arguments[1]).every(x => keyOf(x) === 'store')) takeStore(prop(expr.arguments[1], 'store'));
                else todos.push(ctx.todo(stmt, 'initComponent statement'))
            }
        } else entries.push(...convertKeys(ctx, [p], R.FIELD_KEYS))
    }

    // a Reset combo keeps neo's default (clearable)
    if (kind === 'combo' && base !== 'go.form.ComboBoxReset' && R.PLAIN_COMBO_CLEARABLE !== null && !entries.some(e => e[0] === 'clearable')) {
        entries.push(['clearable', String(R.PLAIN_COMBO_CLEARABLE)])
    }
    const body = print(obj([...entries, ['...config', '']]));
    return [`export const ${fn} = config => (${body});`, ...todos.map(t => printTodo(t, ''))].join('\n')
}

/** go.data.Store baseParams: filter → jmapFilter, the other params → queryArgs (viewType …) */
function baseParams(ctx, node) {
    const out = [], rest = [];
    for (const p of props(node)) {
        if (keyOf(p) === 'filter') {
            const v = valueCode(ctx, p.value);
            out.push(v ? ['jmapFilter', v] : ctx.todo(p, 'store filter is code', 'store handling'))
        } else rest.push(p)
    }
    if (rest.length) {
        const v = valueCode(ctx, {type: 'ObjectExpression', properties: rest});
        out.push(v ? ['queryArgs', v] : ctx.todo(node, 'store baseParams are code', 'store handling'))
    }
    return out
}

/** go.data.Store filters {name: {...}}: one literal filter → jmapFilter, else a TODO */
function storeFilters(ctx, p) {
    const named = props(p.value), v = named.length === 1 && valueCode(ctx, named[0].value);
    return [v ? ['jmapFilter', v] : ctx.todo(p, 'store filters are code or more than one', 'store handling')]
}

/** sortInfo {field, direction} → JmapComboBox jmapSort */
function sortCode(ctx, node) {
    return `[{property: ${valueCode(ctx, prop(node, 'field'))}, isAscending: ${prop(node, 'direction')?.value !== 'DESC'}}]`
}

/** sortInfo {field, direction = ASC} → JmapStore sorters */
function sortersCode(ctx, node) {
    const dir = prop(node, 'direction');
    return `[{property: ${valueCode(ctx, prop(node, 'field'))}, direction: ${dir ? valueCode(ctx, dir) : "'ASC'"}}]`
}

/**
 * @summary go.Modules.register(pkg, name, {...}) → ModuleRegistry.register() of Index.mjs.
 */
function convertRegister(ctx, call) {
    const [pkg, name, cfg] = call.arguments,
          entries = [['package', q(pkg.value)], ['name', q(name.value)], ['capability', q(`go:${pkg.value}:${name.value}`)],
                     ['mainView', `() => import('./view/${name.value[0].toUpperCase() + name.value.slice(1)}Main.mjs')`]],
          todos   = [];

    for (const p of props(cfg)) {
        const key = keyOf(p);
        if (key === 'title') entries.splice(2, 0, ['title', valueCode(ctx, p.value)]);
        else if (key === 'entities') todos.push(ctx.todo(p, 'entities: neo reads them from the server; links / filters / routes per entity are manual', 'no rule'));
        else todos.push(ctx.todo(p, `register key "${key}" has no rule`))
    }
    ctx.use('ModuleRegistry');
    return [`ModuleRegistry.register(${print(obj(entries))});`, ...todos.map(t => printTodo(t, ''))].join('\n')
}

/**
 * @summary Scans a module's classic files for the classes and xtypes it defines, so a file that uses
 * a module class (new go.modules.amd.ports.ServiceChips, xtype amdportscountrycombo) gets its factory.
 * @param {String[]} sources
 * @returns {{classes: Object, xtypes: Object}}
 */
export function scanModule(sources) {
    const classes = {}, xtypes = {};

    for (const src of sources) {
        let ast;
        try { ast = acorn.parse(src, {ecmaVersion: 'latest'}) } catch { continue }
        for (const stmt of ast.body) {
            const e = stmt.expression;
            if (e?.type === 'AssignmentExpression' && e.right.type === 'CallExpression' && dotted(e.right.callee) === 'Ext.extend') {
                const baseCls = dotted(e.right.arguments[0]), base = R.BASES[baseCls], cls = dotted(e.left);
                classes[cls] = {kind: base, factory: ['combo', 'chips'].includes(base) ? factoryName(cls) : null,
                    reset: baseCls === 'go.form.ComboBoxReset',
                    entity: /entityStore\s*:\s*['"](\w+)['"]/.exec(src.slice(e.right.start, e.right.end))?.[1] ?? null}
            }
            if (e?.type === 'CallExpression' && dotted(e.callee) === 'Ext.reg') {
                xtypes[e.arguments[0].value] = classes[dotted(e.arguments[1])] ?? {}
            }
        }
    }
    // a Reset combo with a plain sibling over the same entity is the sibling, clearable
    for (const [cls, c] of Object.entries(classes)) {
        const sib = c.reset && /Reset$/.test(cls) && classes[cls.replace(/Reset$/, '')];
        if (sib?.kind === 'combo' && sib.entity && sib.entity === c.entity) c.callAs = sib.factory
    }
    return {classes, xtypes}
}

const registries = new Map();

/**
 * @summary The combos and chips of the other modules next to a module (its package folder), so a use
 * of another module's class (portcall's `new go.modules.amd.ports.PortCombo`) becomes a call of that
 * module's factory, imported from its views/neo/fields.mjs.
 * @param {String} moduleDir
 * @param {String} pkg
 * @returns {{classes: Object, xtypes: Object}} as scanModule(), each entry with its `from` path
 */
export function scanRegistry(moduleDir, pkg) {
    const root = dirname(moduleDir), own = basename(moduleDir);
    if (!registries.has(root)) {
        const all = {classes: {}, xtypes: {}};
        for (const m of existsSync(root) ? readdirSync(root) : []) {
            if (!existsSync(join(root, m, 'views/extjs3'))) continue;
            const scan = scanModule(classicFiles(join(root, m)).map(f => readFileSync(f, 'utf8'))),
                  from = `${pkg}/${m}/views/neo/fields.mjs`;
            for (const kind of ['classes', 'xtypes']) {
                for (const [k, c] of Object.entries(scan[kind])) c.factory && (all[kind][k] = {...c, module: m, from})
            }
        }
        registries.set(root, all)
    }
    const all = registries.get(root), not = o => Object.fromEntries(Object.entries(o).filter(([, c]) => c.module !== own));
    return {classes: not(all.classes), xtypes: not(all.xtypes)}
}

/**
 * @summary Converts one classic file.
 * @param {String} src
 * @param {Object} module {pkg, name, iconMap, classes, xtypes}
 * @param {String} [file] its name (Module.js becomes Index.mjs: other import depth)
 * @returns {{code: String, todos: Object[], classicLines: Number, todoLines: Number, kind: String}}
 */
export function convertSource(src, module, file = '') {
    const ctx  = new FileContext(src, module),
          ast  = acorn.parse(src, {ecmaVersion: 'latest', locations: true}),
          body = [];
    let kind = 'other', exported = false;
    // a file with two classes: the first is the default export, the others named ones
    const exportOf = name => exported ? `\nexport {${name}};` : (exported = true, `\nexport default Neo.setupClass(${name});`),
          setup    = name => exported ? `\nNeo.setupClass(${name});${exportOf(name)}` : exportOf(name);

    for (const stmt of ast.body) {
        const e = stmt.expression;

        if (e?.type === 'AssignmentExpression' && e.right.type === 'CallExpression' && dotted(e.right.callee) === 'Ext.extend'
            && e.right.arguments[1]?.type === 'ObjectExpression') {
            const name    = dotted(e.left).split('.').pop(),
                  base    = dotted(e.right.arguments[0]),
                  members = props(e.right.arguments[1]);
            kind = R.BASES[base] ?? 'unknown';

            switch (kind) {
                case 'dialog': body.push(convertDialog(ctx, name, members), setup(name)); break;
                case 'grid':   body.push(convertGrid(ctx, name, members), setup(name)); break;
                case 'detail': body.push(convertDetail(ctx, name, members), setup(name)); break;
                case 'combo':
                case 'chips':  body.push(convertCombo(ctx, name, members, kind, base)); break;
                default:
                    // one TODO per member, so the report sees what kind of code each member is
                    body.push(`// TODO(neo-converter) base class ${base} of ${name} has no rule`,
                        ...members.map(p => printTodo(ctx.todo(p, `${name}.${keyOf(p)} (base ${base})`), '')))
            }
        } else if (e?.type === 'CallExpression' && dotted(e.callee) === 'Ext.reg') {
            // xtypes are classic only: neo code imports the module or its factory
        } else if (e?.type === 'CallExpression' && dotted(e.callee) === 'go.Modules.register') {
            kind = 'register';
            body.push(convertRegister(ctx, e))
        } else {
            body.push(printTodo(ctx.todo(stmt, 'top-level statement has no rule'), ''))
        }
    }

    const code = header(ctx, module, kind === 'register' ? 6 : 7) + body.join('\n') + '\n';

    // classic lines that went into TODOs (each line once)
    const starts = [0];
    for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
    const srcLines = src.split('\n'),
          // 1-based line of a position (binary search over the line starts)
          lineOf   = pos => {
              let lo = 0, hi = starts.length - 1;
              while (lo < hi) {
                  const mid = (lo + hi + 1) >> 1;
                  starts[mid] <= pos ? lo = mid : hi = mid - 1
              }
              return lo + 1
          },
          todoLines = new Set();
    const linesOf = t => {
        const set = new Set();
        for (const n of t.nodes ?? [t]) {
            for (let l = lineOf(n.start); l <= lineOf(n.end); l++) srcLines[l - 1]?.trim() && set.add(l)
        }
        return set
    };
    ctx.todos.forEach(t => linesOf(t).forEach(l => todoLines.add(l)));

    return {
        code,
        kind,
        file,
        todos       : ctx.todos.map(t => ({kind: t.kind, reason: t.reason, lines: linesOf(t).size})),
        classicLines: src.split('\n').filter(l => l.trim()).length,
        todoLines   : todoLines.size
    }
}

/** imports, translator and generated helpers of a converted file */
function header(ctx, module, depth) {
    const prefix = '../'.repeat(depth) + 'views/neo/',
          lines  = [];

    ctx.use('translator');
    if (ctx.helpers.size) ctx.use('escapeHtml');
    if (ctx.helpers.has('dateTimeRenderer')) ['formatUserDateTime', 'smartDateTime'].forEach(n => ctx.use(n));

    const named = new Map();
    for (const [local, rule] of [...ctx.imports].filter(([n]) => !ctx.defined.has(n)).sort(([a], [b]) => a.localeCompare(b))) {
        if (Array.isArray(rule)) {
            const path = rule[0].startsWith('.') ? rule[0] : prefix + rule[0];
            named.set(path, [...(named.get(path) ?? []), rule[1]])
        } else lines.push(`import ${local.padEnd(12)} from '${prefix}${rule}';`)
    }
    for (const [path, names] of named) lines.push(`import {${names.join(', ')}} from '${path}';`);

    lines.push('', `const t = translator(${q(module.pkg)}, ${q(module.name)});`);
    if (ctx.helpers.has('checkRenderer')) {
        lines.push('', '/** read-only check of a flag column (classic checkcolumn) */',
            "const checkRenderer = ({value}) =>\n    `<i class=\"go-icon\" aria-label=\"${escapeHtml(value ? t('Yes') : t('No'))}\">${value ? 'check_box' : 'check_box_outline_blank'}</i>`;")
    }
    if (ctx.helpers.has('dateTimeRenderer')) {
        lines.push('', '/** classic datecolumn */',
            'const dateTimeRenderer = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>` : \'\';')
    }
    return lines.join('\n') + '\n\n'
}

/**
 * @summary The classic files of a module in scripts.txt order (files it does not list after them).
 * @param {String} moduleDir
 * @returns {String[]} paths
 */
export function classicFiles(moduleDir) {
    const dir    = join(moduleDir, 'views/extjs3'),
          listed = existsSync(join(dir, 'scripts.txt'))
              ? readFileSync(join(dir, 'scripts.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l.endsWith('.js')) : [],
          all    = readdirSync(dir, {recursive: true}).filter(f => f.endsWith('.js'));
    return [...new Set([...listed, ...all])].filter(f => existsSync(join(dir, f))).map(f => join(dir, f))
}

/**
 * @summary Converts every classic file of a module.
 * @param {String} moduleDir e.g. ~/Projects/groupoffice26-neo-amd/ports
 * @param {String} pkg
 * @returns {Object[]} convertSource() results
 */
export function convertModule(moduleDir, pkg = 'amd') {
    const files   = classicFiles(moduleDir),
          sources = files.map(f => readFileSync(f, 'utf8')),
          module  = {pkg, name: basename(moduleDir), iconMap: loadIconMap(moduleDir), ...scanModule(sources), registry: scanRegistry(moduleDir, pkg)};
    return files.map((f, i) => {
        const file = f.slice(join(moduleDir, 'views/extjs3').length + 1);
        try {
            return convertSource(sources[i], module, file)
        } catch (e) {
            // one file the converter cannot read (a vendored library, a bug) must not stop the module
            const lines = sources[i].split('\n').filter(l => l.trim()).length;
            return {code: `// TODO(neo-converter) [error] ${String(e.message).replace(/\n/g, ' ')}\n`, kind: 'error', file, error: e,
                todos: [{kind: 'error', reason: e.message, lines}], classicLines: lines, todoLines: lines}
        }
    })
}

/**
 * @summary Output path of a converted classic file, relative to views/neo: Module.js → Index.mjs,
 * MainPanel.js → view/<Module>Main.mjs (the mainView Index.mjs registers).
 * @param {String} file classic path below views/extjs3
 * @param {String} module module name
 * @returns {String}
 */
export const outPath = (file, module) => basename(file) === 'Module.js' ? 'Index.mjs'
    : basename(file) === 'MainPanel.js' ? `view/${module[0].toUpperCase() + module.slice(1)}Main.mjs`
    : 'view/' + file.replace(/\.js$/, '.mjs');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2),
          dir  = resolve(args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out' && args[args.indexOf(a) - 1] !== '--package')),
          out  = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : null,
          pkg  = args.includes('--package') ? args[args.indexOf('--package') + 1] : 'amd';

    const results = convertModule(dir, pkg),
          name    = basename(dir);
    for (const r of results) {
        if (out) {
            const target = join(out, outPath(r.file, name));
            mkdirSync(dirname(target), {recursive: true});
            writeFileSync(target, r.code)
        }
        console.log(`${r.file.padEnd(28)} ${r.kind.padEnd(9)} classic ${String(r.classicLines).padStart(4)} lines, TODO ${String(r.todoLines).padStart(4)} lines in ${r.todos.length} blocks`)
    }
    // the factories other files import from '../fields.mjs'
    const factories = results.filter(r => ['combo', 'chips'].includes(r.kind));
    if (out && factories.length) {
        writeFileSync(join(out, 'fields.mjs'), factories.map(r => `export * from './${outPath(r.file, name)}';`).join('\n') + '\n')
    }
}
