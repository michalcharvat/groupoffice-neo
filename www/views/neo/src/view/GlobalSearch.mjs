import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button    from '../button/Button.mjs';
import client    from '../jmap/Client.mjs';
import {escapeHtml, smartDateTime} from '../Format.mjs';
import {t} from '../Translate.mjs';

/**
 * GO's header search (go.search.SearchField in the ExtJS shell): a field over the whole
 * top bar, results of the core "Search" entity in a panel below it.
 *
 * A result opens through `resolveRoute(entity, entityId)` (set by the shell): a hash
 * for entities that have a neo module, null for the rest (shown, not clickable).
 */
class GlobalSearch extends Container {
    static config = {
        className: 'GO.view.GlobalSearch',
        baseCls  : ['go-global-search', 'neo-container'],
        hidden   : true,
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Function|null} resolveRoute=null
         */
        resolveRoute: null,
        items: [{
            ntype : 'container',
            cls   : ['go-global-search-bar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', pack: 'center'},
            items : [{
                // GO: a translucent box in the middle of the header, × inside it
                ntype : 'container',
                cls   : ['go-global-search-box'],
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module         : TextField,
                    reference      : 'field',
                    flex           : 1,
                    hideLabel      : true,
                    clearable      : false,
                    placeholderText: t('Search...'),
                    autoComplete   : false
                }, {
                    module   : Button,
                    icon     : 'close',
                    reference: 'closeButton',
                    tooltip  : t('Close search'),
                    flex     : 'none'
                }]
            }]
        }, {
            ntype    : 'component',
            reference: 'results',
            cls      : ['go-global-search-results'],
            hidden   : true,
            html     : ''
        }]
    }

    /**
     * Latest result records, by index of the rendered rows
     * @member {Object[]} records=[]
     */
    records = []

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('closeButton').handler = () => me.close();
        me.getReference('field').on('change', ({value}) => me.onSearch(value));

        me.getReference('results').addDomListeners([{
            click: me.onResultClick,
            scope: me
        }])
    }

    open() {
        let me = this;

        me.hidden = false;
        // the field has to be in the DOM again; 30 ms was too short on a busy worker
        me.timeout(100).then(() => me.isDestroyed || me.getReference('field').focus())
    }

    close() {
        let me = this;

        me.hidden = true;
        me.getReference('field').value = '';
        me.showResults(null)
    }

    async onSearch(text) {
        let me         = this,
            generation = me.searchGeneration = (me.searchGeneration || 0) + 1;

        text = String(text || '').trim();

        // GO searches from 2 characters on
        if (text.length < 2) {
            me.showResults(null);
            return
        }

        // debounce typing
        await me.timeout(250);

        if (generation !== me.searchGeneration) {
            return
        }

        try {
            const {list} = await client.queryGet('Search', {
                filter    : {text},
                sort      : [{property: 'modifiedAt', isAscending: false}],
                limit     : 20,
                properties: ['id', 'name', 'description', 'entity', 'entityId', 'modifiedAt']
            });

            generation === me.searchGeneration && !me.isDestroyed && me.showResults(list)
        } catch (e) {
            generation === me.searchGeneration && !me.isDestroyed && me.showResults(null, e.message)
        }
    }

    /**
     * @param {Object[]|null} list
     * @param {String} [error]
     */
    showResults(list, error) {
        let me      = this,
            results = me.getReference('results');

        me.records = list || [];

        if (!list && !error) {
            results.hidden = true;
            return
        }

        results.hidden = false;

        if (error) {
            results.html = `<div class="go-empty">${escapeHtml(error)}</div>`;
            return
        }

        if (!list.length) {
            results.html = '<div class="go-empty">No items found</div>';
            return
        }

        results.html = list.map((r, i) => {
            const route = me.resolveRoute?.(r.entity, r.entityId);

            return `<div class="go-search-result${route ? '' : ' go-disabled'}" data-index="${i}" title="${route ? '' : escapeHtml(t('Open it in the classic UI'))}">
                <span class="go-search-entity">${escapeHtml(r.entity)}</span>
                <span class="go-search-text"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description || '')}</small></span>
                <span class="go-search-date">${smartDateTime(r.modifiedAt)}</span>
            </div>`
        }).join('')
    }

    onResultClick({path}) {
        let me    = this,
            // neo passes a node's dataset as `data`
            index = path.find(n => n.cls?.includes('go-search-result'))?.data?.index;

        const record = me.records[Number(index)],
              route  = record && me.resolveRoute?.(record.entity, record.entityId);

        if (route) {
            me.close();
            Neo.Main.setRoute({value: route, windowId: me.windowId})
        }
    }
}

export default Neo.setupClass(GlobalSearch);
