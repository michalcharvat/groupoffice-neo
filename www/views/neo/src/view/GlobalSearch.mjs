import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button    from '../button/Button.mjs';
import client    from '../jmap/Client.mjs';
import {escapeHtml, smartDateTime} from '../Format.mjs';
import {t} from '../Translate.mjs';
import {searchesWhileTyping} from '../form/searchWhileTyping.mjs';

/**
 * @summary Header search over the core Search entity
 *
 * GO's header search (go.search.SearchField in the ExtJS shell): a field over the whole
 * top bar, results of the core "Search" entity in a panel below it. It searches while typing
 * from 3 characters, and on Enter for any text (an empty field lists the latest changes).
 *
 * A result opens through `resolveRoute(entity, entityId)` (set by the shell): a hash
 * for entities that have a neo module, null for the rest (shown, not clickable).
 *
 * `extraResults(text)` (set by the shell, from main view extensions) may add results of its own,
 * shown above the server's: Promise<[{entity, name, description, route}]>; `entity` is the label
 * on the left, `route` the hash a click opens.
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
        /**
         * (text) => Promise<Object[]> results of the main view's extensions, see above
         * @member {Function|null} extraResults=null
         */
        extraResults: null,
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
                    autoComplete   : false,
                    keys           : {Enter: (data, field) => field.up({className: 'GO.view.GlobalSearch'}).onSearch(field.value, true)}
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
        // drops a search in flight: setting an empty field again fires no change
        me.searchGeneration = (me.searchGeneration || 0) + 1;
        me.getReference('field').value = '';
        me.showResults(null)
    }

    /**
     * @summary Searches 250ms after typing from 3 characters, right away on Enter for any text
     * @param {String|null} text
     * @param {Boolean} [now=false] Enter: no debounce, also an empty or short text
     */
    async onSearch(text, now = false) {
        let me         = this,
            generation = me.searchGeneration = (me.searchGeneration || 0) + 1;

        text = String(text || '').trim();

        // typing fewer than 3 characters only clears the results
        if (!now && (!text || !searchesWhileTyping(text))) {
            me.showResults(null);
            return
        }

        if (!now) {
            await me.timeout(250);

            if (generation !== me.searchGeneration) {
                return
            }
        }

        // the extensions' results never hold up or break the server's
        const extra = Promise.resolve(text && me.extraResults?.(text)).catch(e => {
            console.warn('GlobalSearch: extraResults', e);
            return []
        });

        try {
            const [{list}, own] = await Promise.all([client.queryGet('Search', {
                filter    : text ? {text} : {},
                sort      : [{property: 'modifiedAt', isAscending: false}],
                limit     : 20,
                properties: ['id', 'name', 'description', 'entity', 'entityId', 'modifiedAt']
            }), extra]);

            generation === me.searchGeneration && !me.isDestroyed && me.showResults([...own || [], ...list])
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
            const route = me.routeOf(r);

            return `<div class="go-search-result${route ? '' : ' go-disabled'}" data-index="${i}" title="${route ? '' : escapeHtml(t('Open it in the classic UI'))}">
                <span class="go-search-entity">${escapeHtml(r.entity)}</span>
                <span class="go-search-text"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description || '')}</small></span>
                <span class="go-search-date">${r.modifiedAt ? smartDateTime(r.modifiedAt) : ''}</span>
            </div>`
        }).join('')
    }

    /**
     * @param {Object} record a result
     * @returns {String|null} the hash it opens
     * @protected
     */
    routeOf(record) {
        return record.route ?? this.resolveRoute?.(record.entity, record.entityId) ?? null
    }

    onResultClick({path}) {
        let me    = this,
            // neo passes a node's dataset as `data`
            index = path.find(n => n.cls?.includes('go-search-result'))?.data?.index;

        const record = me.records[Number(index)],
              route  = record && me.routeOf(record);

        if (route) {
            me.close();
            Neo.Main.setRoute({value: route, windowId: me.windowId})
        }
    }
}

export default Neo.setupClass(GlobalSearch);
