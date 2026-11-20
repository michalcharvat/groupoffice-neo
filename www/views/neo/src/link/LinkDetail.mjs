import Card from '../detail/Card.mjs';
import {escapeHtml} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import {loadLinks, onLinkListClick, renderLinks} from './links.mjs';

/**
 * Links of the shown entity in a detail view, like GOUI LinkDetail.getAll(): the
 * linked items grouped by type (one heading per type instead of GOUI's card per
 * type). Hidden while the entity has no links, like the GOUI cards.
 *
 * A click opens the item in its neo module (ModuleRegistry `routes`); items of
 * modules without a neo UI are listed but not clickable.
 *
 * Links to the `excludeEntities` are left out: a module card shows them (LinkCards,
 * ModuleRegistry `linkDetailCards`, like ExtJS linkDetailCards replacing the type's panel).
 */
class LinkDetail extends Card {
    static config = {
        className: 'GO.link.LinkDetail',
        cls      : ['go-link-detail'],
        title    : t('Links'),
        stateId  : 'links-detail',
        hidden   : true,
        watch    : ['Link'],
        /**
         * Entities whose links are not listed, e.g. ['Task']
         * @member {String[]} excludeEntities=[]
         */
        excludeEntities: []
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

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-links'],
            html     : ''
        }]
    }

    setEntity(entity, entityId, record=null) {
        // the rows of another item must not stay clickable (unlink) while the new ones load
        if (this.current?.entity !== entity || this.current?.entityId !== entityId) {
            this.clearData()
        }

        super.setEntity(entity, entityId, record)
    }

    async loadData(entity, entityId) {
        const links = await loadLinks(entity, entityId);

        return links.filter(({link}) => !this.excludeEntities.includes(link.toEntity))
    }

    showData(links) {
        let me = this;

        me.links  = links;
        me.hidden = !links.length;
        me.getReference('list').html = renderLinks(links);
        me.fire('linkCount', {count: links.length})
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

export default Neo.setupClass(LinkDetail);
