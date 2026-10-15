import TextField from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar   from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../button/Button.mjs';
import client    from '../jmap/Client.mjs';
import {escapeHtml, smartDateTime} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import Dialog    from '../view/Dialog.mjs';
import {linkType} from './linkTypes.mjs';

/**
 * Pick items to link, like GOUI SelectSearchWindow / SelectSearchPanel: a search
 * over the core `Search` entity (newest first), click rows to select, "Add" fires
 * `select` with the Search records and closes.
 *
 * GOUI's entity type list on the left is not ported: results of all types are
 * shown with their type icon.
 */
class SelectSearchDialog extends Dialog {
    static config = {
        className: 'GO.link.SelectSearchDialog',
        cls      : ['go-select-search-dialog'],
        modal    : true,
        resizable: true,
        title    : t('Add link'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 320px)', top: '12vh', width: '640px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Item that gets the links, excluded from the results: {entity, entityId}
         * @member {Object|null} exclude=null
         */
        exclude: null
    }

    /**
     * Shown Search records
     * @member {Object[]} records=[]
     */
    records = []

    /**
     * Selected Search records by id (kept across searches)
     * @member {Map} selected
     */
    selected = new Map()

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                module         : TextField,
                reference      : 'searchField',
                flex           : 1,
                hideLabel      : true,
                autoComplete   : false,
                placeholderText: t('Search') + '...'
            }]
        }, {
            ntype    : 'component',
            reference: 'results',
            cls      : ['go-select-search-results'],
            flex     : 1,
            html     : ''
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                ntype    : 'component',
                reference: 'status',
                cls      : ['go-select-search-status'],
                flex     : 1
            }, {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'addButton',
                text     : t('Add'),
                disabled : true,
                handler  : () => me.onAdd()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('searchField').on('change', ({value}) => me.search(value));

        me.getReference('results').addDomListeners({
            click: me.onResultClick,
            scope: me
        });

        me.search('');
        me.timeout(50).then(() => me.getReference('searchField').focus())
    }

    async search(text) {
        let me         = this,
            generation = me.searchGeneration = (me.searchGeneration || 0) + 1;

        text = String(text || '').trim();

        // debounce typing
        text && await me.timeout(250);

        if (me.isDestroyed || generation !== me.searchGeneration) {
            return
        }

        try {
            const {list} = await client.queryGet('Search', {
                filter    : text ? {text} : {},
                sort      : [{property: 'modifiedAt', isAscending: false}],
                limit     : 40,
                properties: ['id', 'name', 'description', 'entity', 'entityId', 'filter', 'modifiedAt']
            });

            if (me.isDestroyed || generation !== me.searchGeneration) {
                return
            }

            const {exclude} = me;

            me.records = list.filter(r => !(exclude && r.entity === exclude.entity && String(r.entityId) === String(exclude.entityId)));
            me.renderResults()
        } catch (e) {
            if (!me.isDestroyed && generation === me.searchGeneration) {
                me.records = [];
                me.getReference('results').html = `<div class="go-empty">${escapeHtml(e.message || String(e))}</div>`
            }
        }
    }

    renderResults() {
        let me = this;

        me.getReference('results').html = me.records.length
            ? me.records.map((r, i) => {
                const type = linkType(r.entity, r.filter);

                return `<div class="go-select-search-row${me.selected.has(r.id) ? ' go-selected' : ''}" data-index="${i}">
                    <i class="go-icon go-select-search-check">${me.selected.has(r.id) ? 'check_box' : 'check_box_outline_blank'}</i>
                    <i class="go-icon" title="${escapeHtml(type.title)}">${escapeHtml(type.icon)}</i>
                    <span class="go-link-text"><b>${escapeHtml(r.name)}</b>${r.description ? `<small>${escapeHtml(r.description)}</small>` : ''}</span>
                    <span class="go-link-date">${escapeHtml(smartDateTime(r.modifiedAt))}</span>
                </div>`
            }).join('')
            : `<div class="go-empty">${escapeHtml(t('No items found'))}</div>`;

        me.getReference('addButton').disabled = !me.selected.size;
        me.getReference('status').text = me.selected.size ? `${me.selected.size} ${t('selected')}` : ''
    }

    onResultClick({path}) {
        let me     = this,
            index  = path.find(node => node.cls?.includes('go-select-search-row'))?.data?.index,
            record = me.records[Number(index)];

        if (!record) {
            return
        }

        me.selected.has(record.id) ? me.selected.delete(record.id) : me.selected.set(record.id, record);
        me.renderResults()
    }

    onAdd() {
        let me = this;

        if (!me.selected.size) {
            return
        }

        try {
            me.fire('select', {records: [...me.selected.values()]})
        } catch (e) {
            notifyError(me, e)
        }

        me.close()
    }
}

export default Neo.setupClass(SelectSearchDialog);
