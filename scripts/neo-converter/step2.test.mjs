// node --test scripts/neo-converter/  (hardening step 2 rules, docs/neo-converter-study.md)
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {acorn, convertSource, scanModule} from './convert.mjs';
import {autoMapping} from './measure.mjs';

const base = {pkg: 'amd', name: 'demo', iconMap: {'ic-add': 'add', 'ic-cloud-upload': 'cloud_upload'}, classes: {}, xtypes: {}};

/** converts and checks that the output parses as an ES module */
function convert(src, module = base) {
    const r = convertSource(src, module);
    acorn.parse(r.code, {ecmaVersion: 'latest', sourceType: 'module'});
    return r
}

test('grid tbar: tbsearch → ListToolbar searchFilters, Add → endItems + onAdd(), ⋮ Export → exportFormats', () => {
    const r = convert(`go.modules.amd.demo.G = Ext.extend(go.grid.GridPanel, {
        initComponent: function () {
            var tbar = ['->', {xtype: 'tbsearch', filters: ['text', 'name', 'modifiedat']},
                this.addButton = new Ext.Button({iconCls: 'ic-add', tooltip: t('Add'), handler: function () { new go.modules.amd.demo.D().show(); }, scope: this}),
                {iconCls: 'ic-more-vert', menu: [
                    {iconCls: 'ic-cloud-upload', text: t('Import'), handler: function () { go.util.importFile('Thing', '.csv'); }},
                    {iconCls: 'ic-cloud-download', text: t('Export'), handler: function () { go.util.exportToFile('Thing', {}, 'csv'); }}
                ]}];
            Ext.applyIf(this, {tbar: tbar, store: new go.data.Store({fields: ['id', 'name'], entityStore: 'Thing'}),
                columns: [{header: t('Name'), dataIndex: 'name'}], stateId: 'demo-g'});
            this.supr().initComponent.call(this);
        }
    });`);

    assert.match(r.code, /class G extends Container/);
    assert.match(r.code, /module\s+: ListToolbar/);
    assert.match(r.code, /\{name: 'text', type: 'string', multiple: false, title: t\('Query'\)\}/);
    assert.match(r.code, /\{name: 'name', type: 'string', multiple: true, title: t\('Name'\)\}/);
    assert.match(r.code, /\{name: 'modifiedat', type: 'date', multiple: false, title: t\('Modified at'\)\}/);
    assert.match(r.code, /exportFormats: \['csv'\]/);
    assert.match(r.code, /moreItems\s+: \(\{export: exp\}\) =>/);
    assert.match(r.code, /handler\s+: \(\) => me\.onAdd\(\)/);
    assert.match(r.code, /onAdd\(\) \{\n\s+\/\/ TODO\(neo-converter\) \[handler\] Add handler/);
    assert.match(r.code, /setGrid\(this\.getReference\('grid'\)\)/);
    assert.match(r.code, /module\s+: Grid/);
    assert.doesNotMatch(r.code, /grid key "tbar"|initComponent statement/);
});

test('grid selection model → multiSelect, its checkbox column goes; a grid without tbar stays a Grid', () => {
    const r = convert(`go.modules.amd.demo.G = Ext.extend(go.grid.GridPanel, {
        initComponent: function () {
            var selModel = new Ext.grid.CheckboxSelectionModel();
            Ext.apply(this, {selModel: selModel, columns: [selModel, {header: t('Name'), dataIndex: 'name'}]});
            this.supr().initComponent.call(this);
        }
    });`);
    assert.match(r.code, /class G extends Grid/);
    assert.match(r.code, /multiSelect: true/);
    assert.equal(r.todos.length, 0);

    const single = convert(`go.modules.amd.demo.G = Ext.extend(go.grid.GridPanel, {
        sm: new Ext.grid.RowSelectionModel({singleSelect: true}), columns: [{header: t('Name'), dataIndex: 'name'}]
    });`);
    assert.doesNotMatch(single.code, /multiSelect/);
    assert.equal(single.todos.length, 0);
});

test('grid row menu: initRowActions + showMoreMenu Edit / Delete → entityActions + Grid.rowMenuColumn()', () => {
    const r = convert(`go.modules.amd.demo.G = Ext.extend(go.grid.GridPanel, {
        initComponent: function () {
            var actions = this.initRowActions();
            Ext.apply(this, {plugins: [actions], columns: [{header: t('Name'), dataIndex: 'name'}, actions]});
            this.supr().initComponent.call(this);
        },
        initRowActions: function () {
            var actions = new Ext.ux.grid.RowActions({actions: [{iconCls: 'ic-more-vert'}]});
            actions.on({action: function (grid, record, action, row, col, e) { this.showMoreMenu(record, e); }, scope: this});
            return actions;
        },
        showMoreMenu: function (record, e) {
            if (!this.moreMenu) {
                this.moreMenu = new Ext.menu.Menu({items: [
                    {itemId: 'edit', iconCls: 'ic-edit', text: t('Edit'), handler: function () { var dlg = new go.modules.amd.demo.ThingDialog(); dlg.load(this.moreMenu.record.id).show(); }},
                    {itemId: 'delete', iconCls: 'ic-delete', text: t('Delete'), handler: function () { go.Db.store('Thing').set({destroy: [1]}); }},
                    {iconCls: 'ic-print', text: t('Print'), handler: function () { window.print(); }}
                ]});
            }
            this.moreMenu.showAt(e.getXY());
        }
    });`);

    assert.match(r.code, /dialog\s+: \(\) => import\('\.\/ThingDialog\.mjs'\)/);
    assert.match(r.code, /rowMenuItems: \(record, \{edit, delete: del\}\) => \[edit, del\]/);
    assert.match(r.code, /Grid\.rowMenuColumn\(\)/);
    // only the Print item is left to port
    assert.deepEqual(r.todos.map(t => t.reason), ['row menu item: add it in rowMenuItems']);
});

test('combo: a plain combo is not clearable, a Reset one keeps the default; store in initComponent with baseParams', () => {
    const plain = convert(`go.modules.amd.demo.ThingCombo = Ext.extend(go.form.ComboBox, {
        hiddenName: 'thingId', displayField: 'name', valueField: 'id',
        initComponent: function () {
            Ext.apply(this, {store: new go.data.Store({fields: ['id', 'name'], entityStore: 'Thing', autoLoad: true,
                baseParams: {viewType: 'combo', filter: {permissionLevel: go.permissionLevels.write}}})});
            go.modules.amd.demo.ThingCombo.superclass.initComponent.call(this);
        }
    });`);
    assert.match(plain.code, /entity\s+: 'Thing'/);
    assert.match(plain.code, /jmapFilter\s*: \{permissionLevel: LEVEL_WRITE\}/);
    assert.match(plain.code, /import \{LEVEL_WRITE\} from '[./]+views\/neo\/src\/Acl\.mjs'/);
    assert.match(plain.code, /queryArgs\s*: \{viewType: 'combo'\}/);
    assert.match(plain.code, /clearable\s*: false/);
    assert.equal(plain.todos.length, 0);

    const reset = convert(`go.modules.amd.demo.ThingComboReset = Ext.extend(go.form.ComboBoxReset, {
        hiddenName: 'thingId', store: {xtype: 'gostore', fields: ['id', 'name'], entityStore: 'Thing'}
    });`);
    assert.doesNotMatch(reset.code, /clearable/);
});

test('a Reset combo with a plain sibling: its uses call the sibling with clearable: true', () => {
    const scan = scanModule([
        `go.modules.amd.demo.ThingCombo = Ext.extend(go.form.ComboBox, {store: {entityStore: 'Thing'}});`,
        `go.modules.amd.demo.ThingComboReset = Ext.extend(go.form.ComboBoxReset, {store: {entityStore: 'Thing'}});`
    ]);
    assert.equal(scan.classes['go.modules.amd.demo.ThingComboReset'].callAs, 'thingCombo');

    const r = convert(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {
        initFormItems: function () { return [new go.modules.amd.demo.ThingComboReset({fieldLabel: t('Thing')})]; }
    });`, {...base, ...scan});
    assert.match(r.code, /thingCombo\(\{\n\s+clearable\s*: true,/);
    assert.match(r.code, /import \{thingCombo\} from '\.\.\/fields\.mjs'/);
});

test("registry: another module's combo class → that module's factory", () => {
    const registry = {classes: {'go.modules.amd.ports.PortCombo': {kind: 'combo', factory: 'portCombo', module: 'ports', from: 'amd/ports/views/neo/fields.mjs'}}, xtypes: {}};
    const r = convert(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {
        initFormItems: function () { return [new go.modules.amd.ports.PortCombo({hiddenName: 'portId'})]; }
    });`, {...base, registry});
    assert.match(r.code, /import \{portCombo\} from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/amd\/ports\/views\/neo\/fields\.mjs'/);
    assert.match(r.code, /portCombo\(\{/);
    assert.equal(r.todos.length, 0);
});

test('dialog: containers, field classes, gonumberfield, selectfield, items without xtype', () => {
    const r = convert(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {
        initFormItems: function () {
            return [{xtype: 'container', layout: 'column', items: [
                    {columnWidth: .5, items: [{name: 'a', fieldLabel: t('A')}]},
                    {xtype: 'textfield', name: 'b', columnWidth: .5}]},
                {xtype: 'container', items: [new Ext.form.TextArea({name: 'c'})]},
                {xtype: 'gonumberfield', name: 'd', decimals: 2},
                {xtype: 'selectfield', name: 'e', options: [['x', t('X')], ['y', t('Y')]]}];
        }
    });`);

    assert.equal(r.todos.length, 0);
    assert.match(r.code, /layout: \{ntype: 'hbox', align: 'start'\}/);
    assert.match(r.code, /layout: \{ntype: 'vbox', align: 'stretch'\}/);
    assert.match(r.code, /flex\s+: \.5/);
    assert.match(r.code, /module\s+: TextArea,\n\s+name\s+: 'c'/);
    assert.match(r.code, /stepSize\s+: 0\.01/);
    assert.match(r.code, /options\s+: \[\{value: 'x', text: t\('X'\)\}/);
    assert.match(r.code, /properties: \['id', 'a', 'b', 'c', 'd', 'e'\]/);
});

test('dialog initFormItems: locals, me.x items with the field name as reference, addPanel → onConstructed()', () => {
    const r = convert(`go.modules.amd.demo.D = Ext.extend(go.form.Dialog, {
        initFormItems: function () {
            var me = this;
            me.nameField = new Ext.form.TextField({name: 'name'});
            me.timezoneField = new Ext.form.TextField({fieldLabel: t('Zone')});
            this.addPanel(new go.permissions.SharePanel());
            this.addPanel({title: t('More'), items: [{xtype: 'textarea', name: 'note'}]});
            var items = [me.nameField, me.timezoneField];
            return items;
        }
    });`);

    // core addSharePanel() is an empty extension point: the permissions card is left to write
    assert.deepEqual(r.todos.map(t => t.reason), ['permissions card: override addSharePanel() (links CategoryDialog.mjs has one)']);
    assert.match(r.code, /reference\s*: 'name'/);
    assert.match(r.code, /reference\s*: 'timezone'/);
    assert.match(r.code, /onConstructed\(\) \{[\s\S]*this\.addSharePanel\(\);[\s\S]*this\.addCard\(\{\n\s+header: \{text: t\('More'\)\}/);
    // the card's fields are loaded too
    assert.match(r.code, /properties: \['id', 'name', 'note'\]/);
});

test('detail templates: htmlEncode goes, nl2br → {html}, go.util.Format.dateTime, markup in an expression stays TODO', () => {
    const r = convert(`go.modules.amd.demo.T = Ext.extend(go.detail.Panel, {
        entityStore: 'Thing',
        initComponent: function () {
            Ext.apply(this, {items: [{title: t('Thing'), tpl: new Ext.XTemplate(
                '<p><label>{[t("Name")]}</label><span>{[values.name ? Ext.util.Format.htmlEncode(values.name) : "-"]}</span></p>' +
                '<p><label>{[t("Note")]}</label><span>{[Ext.util.Format.nl2br(Ext.util.Format.htmlEncode(values.note || ""))]}</span></p>' +
                '<p><label>{[t("Text")]}</label><span>{text:nl2br}</span></p>' +
                '<p><label>{[t("At")]}</label><span>{[go.util.Format.dateTime(values.modifiedAt)]}</span></p>' +
                '<p><label>{[t("Url")]}</label><span>{[values.url ? \\'<a href="\\' + values.url + \\'">x</a>\\' : ""]}</span></p>')}]});
            this.supr().initComponent.call(this);
        }
    });`);

    assert.match(r.code, /\[t\('Name'\), record\.name \? record\.name : "-"\]/);
    assert.match(r.code, /\[t\('Note'\), record\.note \? \{html: escapeHtml\(record\.note\)\.replace\(\/\\r\?\\n\/g, '<br>'\)\} : '-'\]/);
    assert.match(r.code, /\[t\('Text'\), record\.text \? \{html:/);
    assert.match(r.code, /\[t\('At'\), formatUserDateTime\(record\.modifiedAt\)\]/);
    assert.deepEqual(r.todos.map(t => t.reason), ['row "Url" is code']);
});

test('measure: the held-out mapping goes by name only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'neo-conv-'));
    for (const f of ['Index.mjs', 'fields.mjs', 'view/DemoMain.mjs', 'view/ThingDialog.mjs', 'view/ThingGrid.mjs', 'model/Thing.mjs']) {
        mkdirSync(join(dir, f, '..'), {recursive: true});
        writeFileSync(join(dir, f), '')
    }
    assert.deepEqual(autoMapping(dir, ['Module.js', 'MainPanel.js', 'ThingDialog.js', 'ThingGrid.js', 'ThingCombo.js', 'OtherDialog.js']), {
        'Module.js'     : ['Index.mjs'],
        'MainPanel.js'  : ['view/DemoMain.mjs'],
        'ThingDialog.js': ['view/ThingDialog.mjs'],
        'ThingGrid.js'  : ['view/ThingGrid.mjs', 'model/Thing.mjs'],
        'ThingCombo.js' : ['fields.mjs']
    });
});

test('review fixes: trusted HTML, precedence and unbound names in templates stay safe', () => {
    const lines = tpl => convert(`go.modules.amd.demo.T = Ext.extend(go.detail.Panel, {
        initComponent: function () {
            Ext.apply(this, {items: [{title: t('T'), tpl: new Ext.XTemplate('<p><label>{[t("A")]}</label><span>${tpl}</span></p>')}]});
            this.supr().initComponent.call(this);
        }
    });`);
    // an object value would be LinesCard's trusted {html}
    assert.equal(lines('{[{html: values.note}]}').todos.length, 1);
    assert.equal(lines('{[values.a || fallback]}').todos.length, 1);
    assert.match(lines('{[fm.htmlEncode(values.a + values.b) * 2]}').code, /\(record\.a \+ record\.b\) \* 2/);
    assert.match(lines('{[fm.nl2br(values.a ? values.b : values.c)]}').code, /\(record\.a \? record\.b : record\.c\) \? \{html: escapeHtml\(\(record\.a/);
});

test('review fixes: a row menu with its own checks stays a TODO; Reset sibling only with the same allowBlank; odd configs', () => {
    const r = convert(`go.modules.amd.demo.G = Ext.extend(go.grid.GridPanel, {
        initComponent: function () {
            var actions = this.initRowActions();
            Ext.apply(this, {columns: [{header: t('Name'), dataIndex: 'name'}, actions]});
            this.supr().initComponent.call(this);
        },
        showMoreMenu: function (record, e) {
            if (!this.moreMenu) {
                this.moreMenu = new Ext.menu.Menu({items: [{itemId: 'delete', iconCls: 'ic-delete', text: t('Delete'), handler: function () { this.deleteJobReport(); }}]});
            }
            this.moreMenu.getComponent('delete').setDisabled(!record.get('permissionLevel'));
            this.moreMenu.showAt(e.getXY());
        }
    });`);
    assert.ok(r.todos.some(t => /^showMoreMenu/.test(t.reason)));

    const scan = scanModule([
        `go.modules.amd.demo.ThingCombo = Ext.extend(go.form.ComboBox, {allowBlank: false, store: {entityStore: 'Thing'}});`,
        `go.modules.amd.demo.ThingComboReset = Ext.extend(go.form.ComboBoxReset, {allowBlank: true, store: {entityStore: 'Thing'}});`
    ]);
    assert.equal(scan.classes['go.modules.amd.demo.ThingComboReset'].callAs, undefined);

    // Ext.apply(this, config) is code, not a crash; a key that is no identifier is quoted
    const c = convert(`go.modules.amd.demo.C = Ext.extend(go.form.ComboBox, {
        initComponent: function () { Ext.apply(this, config); this.supr().initComponent.call(this); },
        store: {entityStore: 'Thing', baseParams: {'x-mode': 'short'}}
    });`);
    assert.match(c.code, /queryArgs\s*: \{'x-mode': 'short'\}/);
    assert.equal(c.todos.length, 1);
});
