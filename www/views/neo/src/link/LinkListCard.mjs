import Card from '../detail/Card.mjs';
import Button from '../button/Button.mjs';
import {escapeHtml} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import {loadLinks, onLinkListClick, renderLinks} from './links.mjs';

/**
 * Card with the links of the shown entity to one type of item, selected by more Link
 * filters, like ExtJS go.links.DetailPanel with a `link.entity` and a store filter
 * (e.g. the calendar's "Upcoming appointments": {entities: [{name: 'CalendarEvent'}],
 * eventsAfter: true}). Hidden while there are none. A module registers it as one of
 * its ModuleRegistry `linkDetailCards` (see LinkCards).
 *
 * A click opens the item in its neo module; the unlink button deletes the link.
 */
class LinkListCard extends Card {
    static config = {
        className: 'GO.link.LinkListCard',
        cls      : ['go-link-detail', 'go-link-list-card'],
        hidden   : true,
        watch    : ['Link'],
        /**
         * Link filters next to the shown entity
         * @member {Object} filter={}
         */
        filter: {},
        /**
         * Optional "Add" button: (card, {entity, entityId, record}) => void, e.g. a new
         * linked item (the module's linkWindow)
         * @member {Function|null} onAdd=null
         */
        onAdd: null
    }

    /**
     * Rendered items: [{link, to}]
     * @member {Object[]} links=[]
     */
    links = []

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        if (me.isDestroyed) {
            return
        }

        me.getReference('list').addDomListeners({
            click: ({path}) => {
                onLinkListClick(me, me.links, path)
                    .then(deleted => deleted && !me.isDestroyed && me.reload())
                    .catch(e => notifyError(me, e))
            },
            scope: me
        })
    }

    createTools() {
        let me = this;

        return me.onAdd ? [{
            module : Button,
            icon   : 'add',
            tooltip: t('Add'),
            handler: () => me.current && Promise.resolve(me.onAdd(me, me.current)).catch(e => notifyError(me, e))
        }] : []
    }

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-links'],
            html     : ''
        }]
    }

    async loadData(entity, entityId) {
        return loadLinks(entity, entityId, this.filter)
    }

    showData(links) {
        let me = this;

        me.links  = links;
        me.hidden = !links.length;
        me.getReference('list').html = renderLinks(links, {groups: false})
    }

    clearData() {
        let me = this;

        me.links  = [];
        me.hidden = true;
        me.getReference('list').html = ''
    }

    showError(e) {
        let me = this;

        me.hidden = false;
        me.getReference('list').html = `<div class="go-empty">${escapeHtml(e.message || String(e))}</div>`
    }
}

export default Neo.setupClass(LinkListCard);
