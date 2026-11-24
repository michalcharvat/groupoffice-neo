import Button         from '../../button/Button.mjs';
import DataSourceForm from '../../form/DataSourceForm.mjs';
import Grid           from '../../grid/Grid.mjs';
import JmapStore      from '../../data/JmapStore.mjs';
import TextField      from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import client         from '../../jmap/Client.mjs';
import Page, {output, p} from './Page.mjs';
import {escapeHtml, smartDateTime} from '../../Format.mjs';
import {notifyError}  from '../../Notify.mjs';
import {t}            from '../../Translate.mjs';

/**
 * Dev demo: GOUI Data (goui-docs Data.ts). The JMAP entity is the single source of
 * truth: a GO.data.JmapStore reloads its page when the server pushes a change of its
 * entity, so a grid and a GO.form.DataSourceForm over the same entity stay in sync
 * without code. Uses the notes of the user (community/notes).
 */
class Data extends Page {
    static config = {
        className: 'GO.dev.demo.Data',
        heading  : t('Data')
    }

    pageItems() {
        const me = this;

        if (!client.hasCapability('go:community:notes')) {
            return [p(t('This demo uses notes: the notes module is not available.'))]
        }

        return [
            p(t('The JMAP entity on the server is the single source of truth. A GO.data.JmapStore runs Entity/query + Entity/get for its page and reloads it when the server pushes a change of the entity (SSE), also a change made in another window or by another user.')),
            p(t('Select a note, change its name and save: the form saves with Note/set, the push makes the grid reload. Nothing changes until you press Save.')),
            {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'start'},
                style : {gap: '16px'},
                items : [{
                    module   : Grid,
                    reference: 'grid',
                    flex     : 2,
                    height   : 360,
                    cls      : ['go-card'],
                    style    : {margin: 0},
                    store    : {
                        module  : JmapStore,
                        entity  : 'Note',
                        pageSize: 10,
                        model   : {keyProperty: 'id', fields: [
                            {name: 'id', type: 'String'}, {name: 'name', type: 'String'}, {name: 'modifiedAt', type: 'String'}
                        ]},
                        sorters   : [{property: 'modifiedAt', direction: 'DESC'}],
                        properties: ['id', 'name', 'modifiedAt']
                    },
                    columns: [
                        {dataField: 'id', text: t('ID'), width: 70, cellAlign: 'right'},
                        {dataField: 'name', text: t('Name'), flex: 1, renderer: ({value}) => escapeHtml(value)},
                        {dataField: 'modifiedAt', text: t('Modified at'), width: 160, renderer: ({value}) => escapeHtml(smartDateTime(value))}
                    ]
                }, {
                    module    : DataSourceForm,
                    reference : 'form',
                    flex      : 1,
                    entity    : 'Note',
                    properties: ['id', 'name'],
                    disabled  : true,
                    layout    : {ntype: 'vbox', align: 'stretch'},
                    style     : {gap: '12px'},
                    items     : [{
                        module       : TextField,
                        name         : 'name',
                        labelText    : t('Name'),
                        labelPosition: 'inline',
                        required     : true
                    }, {
                        module : Button,
                        ui     : 'primary',
                        text   : t('Save'),
                        style  : {alignSelf: 'end'},
                        handler: () => me.getReference('form').submit().catch(e => notifyError(me, e))
                    }]
                }]
            },
            output()
        ]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid'),
            form = me.getReference('form');

        if (!grid) {
            return
        }

        grid.store.load().catch(e => notifyError(me, e));
        grid.store.on('load', () => me.log(`store load: ${grid.store.getCount()} notes`));

        grid.view.selectionModel.on('selectionChange', ({records}) => {
            const record = records?.[0];

            record && me.loadNote(record.id).catch(e => notifyError(me, e))
        });

        form.on('save', ({data}) => me.log(`Note/set saved: ${data.name} (the grid reloads on the push)`))
    }

    /**
     * Loads the selected note; the form is enabled only when that note loaded and is still
     * the selected one (a failed or overtaken load would leave another note in the form)
     * @param {String} id
     */
    async loadNote(id) {
        let me   = this,
            form = me.getReference('form');

        form.disabled = true;
        me.loadingId  = id;

        const data = await form.load(id);

        if (me.loadingId === id) {
            form.disabled = !data;
            data || me.log(`load(${id}) failed`)
        }
    }

    destroy(...args) {
        // neo's grid leaves its store alive: destroy it after the grid
        const store = this.getReference('grid')?.store;

        super.destroy(...args);
        store?.destroy?.()
    }
}

export default Neo.setupClass(Data);
