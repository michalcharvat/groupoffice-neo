// node --test scripts/neo-converter/
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {convertSource} from './convert.mjs';
import {compare, extractConfigs} from './measure.mjs';

const module = {pkg: 'amd', name: 'demo', iconMap: {'ic-add': 'add'}, classes: {}, xtypes: {}};

test('dialog: fields, renamed keys, properties, wrapperStyle', () => {
    const r = convertSource(`go.modules.amd.demo.ThingDialog = Ext.extend(go.form.Dialog, {
        title: t('Thing', 'demo', 'amd'), entityStore: 'Thing', width: dp(800), height: dp(600), redirectOnSave: false,
        initFormItems: function () {
            return [{xtype: 'fieldset', items: [
                {xtype: 'textfield', name: 'name', fieldLabel: t('Name'), anchor: '100%', allowBlank: false},
                {xtype: 'xcheckbox', name: 'isActive', boxLabel: t('Active')}
            ]}, {xtype: 'fieldset', title: t('More'), items: [{xtype: 'numberfield', name: 'size', allowDecimals: false, allowNegative: false}]}];
        }
    });`, module);

    assert.equal(r.todos.length, 0);
    assert.match(r.code, /class ThingDialog extends FormWindow/);
    assert.match(r.code, /properties\s*: \['id', 'name', 'isActive', 'size'\]/);
    assert.match(r.code, /labelText\s*: t\('Name'\)/);
    assert.match(r.code, /required\s*: true/);
    assert.match(r.code, /valueLabel: t\('Active'\)/);
    assert.match(r.code, /fieldset\(t\('More'\)/);
    assert.match(r.code, /stepSize\s*: 1/);
    assert.match(r.code, /minValue\s*: 0/);
    assert.match(r.code, /width: 'min\(800px, 100vw\)'/);
    assert.doesNotMatch(r.code, /anchor|redirectOnSave/);
});

test('listeners and unknown keys stay as TODO with the original code', () => {
    const r = convertSource(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {
        initFormItems: function () {
            return [{xtype: 'textfield', name: 'a', listeners: {change: function () { go.Db.store('X').get([1]); }}, vtype: 'email'}];
        }
    });`, module);

    assert.deepEqual(r.todos.map(t => t.kind), ['listeners / events', 'no rule']);
    assert.match(r.code, /\/\/ TODO\(neo-converter\) \[listeners \/ events\]/);
    assert.match(r.code, /\/\/ {3}vtype: 'email'/);
});

test('grid: store, columns, checkcolumn and emptyText', () => {
    const r = convertSource(`go.modules.amd.demo.G = Ext.extend(go.grid.GridPanel, {
        initComponent: function () {
            this.store = new go.data.Store({fields: ['id', 'code', {name: 'creator', type: 'relation'}], entityStore: 'Thing', sortInfo: {field: 'code', direction: 'DESC'}});
            Ext.apply(this, {columns: [{id: 'id', header: 'ID', dataIndex: 'id', hidden: true, width: dp(40)},
                {xtype: 'checkcolumn', header: t('On'), dataIndex: 'on'}],
                viewConfig: {emptyText: '<i>description</i><p>' + t('No items to display') + '</p>'}, stateId: 'g'});
            this.supr().initComponent.call(this);
        }
    });`, module);

    assert.match(r.code, /entity\s*: 'Thing'/);
    assert.match(r.code, /sorters\s*: \[\{property: 'code', direction: 'DESC'\}\]/);
    assert.match(r.code, /text\s*: t\('ID'\)/);
    assert.match(r.code, /renderer : checkRenderer/);
    assert.match(r.code, /emptyIcon\s*: 'description'/);
    assert.equal(r.todos.length, 1, 'the relation field');
});

test('detail: template rows become LinesCard lines, add*() calls core cards', () => {
    const r = convertSource(`go.modules.amd.demo.Det = Ext.extend(go.detail.Panel, {
        entityStore: 'Thing',
        initComponent: function () {
            this.items = [{title: t('Thing'), tpl: new Ext.XTemplate('<p><label>{[t("Code")]}</label><span>{code}</span></p>',
                '<tpl if="values.x"><p><label>{[t("X")]}</label><span>{x}</span></p></tpl>')}];
            this.supr().initComponent.call(this);
            this.addLinks();
            this.addHistory();
        }
    });`, module);

    assert.match(r.code, /\[t\('Code'\), record\.code \|\| '-'\]/);
    assert.match(r.code, /cards\s*: \['links', 'history'\]/);
    assert.match(r.code, /conditional row "X"/);
});

test('measure: same, notation (helper spread) and different', () => {
    const conv = extractConfigs(`const a = [{module: TextField, name: 'n', labelText: t('N'), labelPosition: 'inline', required: true}]`),
          hand = extractConfigs(`const inline = {labelPosition: 'inline'};
              const a = [{module: TextField, name: 'n', labelText: t("N"), ...inline, required: false}]`),
          res  = compare(conv, hand);

    assert.equal(res.same, 2);      // module, name
    assert.equal(res.notation, 2);  // labelText quotes, labelPosition via the helper
    assert.equal(res.different, 1); // required
});

test('delta: an added field and a changed key of a classic change', async () => {
    const {configDelta} = await import('./delta.mjs'),
          src = extra => convertSource(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {initFormItems: function () {
              return [{xtype: 'textarea', name: 'note', height: ${extra ? 160 : 100}}${extra ? ", {xtype: 'textfield', name: 'label'}" : ''}];
          }});`, module).code,
          lines = configDelta(src(false), src(true));

    assert.ok(lines.some(l => l.startsWith('+ field:label')));
    assert.ok(lines.includes('~ field:note height: 100 → 160'));
});

test('delta: a changed listener and a late change of a long value show', async () => {
    const {configDelta} = await import('./delta.mjs'),
          src = flag => convertSource(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {initFormItems: function () {
              return [{xtype: 'textfield', name: 'a', listeners: {select: function () { this.load(${flag}); }}},
                  {xtype: 'combo', hiddenName: 'z', store: new Ext.data.ArrayStore({data: [${Array.from({length: 20}, (_, i) => `[${i}, '${i}']`).join(', ')}${flag ? ", [99, '99']" : ''}]})}];
          }});`, module).code,
          lines = configDelta(src(false), src(true));

    assert.ok(lines.some(l => l.startsWith('- // TODO(neo-converter) [listeners')));
    assert.ok(lines.some(l => l.startsWith('+ // TODO(neo-converter) [listeners')));
    assert.ok(lines.some(l => l.startsWith('~ field:z options')));
});

test('robustness: missing sort direction, unknown store, quote in an option, two classes', () => {
    const r = convertSource(`go.modules.amd.demo.A = Ext.extend(go.grid.GridPanel, {initComponent: function () {
            this.store = new go.data.Store({entityStore: 'A', fields: ['id'], sortInfo: {field: 'name'}});
            Ext.apply(this, {columns: [{dataIndex: 'id'}], stateId: 'a'});
        }});
        go.modules.amd.demo.B = Ext.extend(go.grid.GridPanel, {initComponent: function () {
            this.store = new Ext.data.JsonStore({url: 'x'});
            Ext.apply(this, {items: [{xtype: 'combo', store: new Ext.data.ArrayStore({data: [[1, "Owner's copy"]]})}]});
        }});`, module);

    assert.match(r.code, /direction: 'ASC'/);
    assert.match(r.code, /store\s*: null/);
    assert.match(r.code, /export default Neo\.setupClass\(A\)/);
    assert.match(r.code, /export \{B\}/);
});
