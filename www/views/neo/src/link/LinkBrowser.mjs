import TextField from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar   from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import client    from '../jmap/Client.mjs';
import {escapeHtml} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import Dialog    from '../view/Dialog.mjs';
import AddLinkButton from './AddLinkButton.mjs';
import {loadLinks, onLinkListClick, renderLinks} from './links.mjs';

/**
 * All links of an entity (GOUI LinkBrowser): grouped by type, filtered by a search
 * field, "+" links more items, a row opens its item, the icon at the end unlinks.
 *
 * Not ported from GOUI: the entity type list and the preview pane (the item opens
 * in its module instead).
 */
class LinkBrowser extends Dialog {
    static config = {
        className: 'GO.link.LinkBrowser',
        cls      : ['go-link-browser'],
        modal    : true,
        resizable: true,
        title    : t('Links'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 360px)', top: '12vh', width: '720px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String|null} entity=null e.g. "Note"
         */
        entity: null,
        /**
         * @member {String|Number|null} entityId=null
         */
        entityId: null
    }

    /**
     * All links of the entity: [{link, to}]
     * @member {Object[]} links=[]
     */
    links = []

    /**
     * The rendered (filtered) links
     * @member {Object[]} shown=[]
     */
    shown = []

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
            }, {
                module   : AddLinkButton,
                reference: 'addButton',
                icon     : 'add',
                ui       : 'primary'
            }]
        }, {
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-links', 'go-link-browser-list'],
            flex     : 1,
            html     : ''
        }];

        client.watch(['Link']);

        me.removeStateListener = client.on('stateChange', ({changed}) => {
            changed.includes('Link') && me.reload()
        })
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('addButton').setEntity(me.entity, me.entityId);
        me.getReference('addButton').on('linked', () => me.reload());
        me.getReference('searchField').on('change', () => me.renderList());

        me.getReference('list').addDomListeners({
            click: ({path}) => {
                // the dialog is modal: close it when the item opens in its module
                if (!path.some(node => node.cls?.includes('go-link-unlink'))) {
                    const row = path.find(node => node.cls?.includes('go-link'));
                    row && !row.cls.includes('go-link-static') && me.timeout(0).then(() => me.close())
                }

                onLinkListClick(me, me.shown, path)
                    .then(deleted => deleted && !me.isDestroyed && me.reload())
                    .catch(e => notifyError(me, e))
            },
            scope: me
        });

        me.reload()
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    async reload() {
        let me         = this,
            generation = me.generation = (me.generation || 0) + 1;

        try {
            const links = await loadLinks(me.entity, me.entityId);

            if (!me.isDestroyed && generation === me.generation) {
                me.links = links;
                me.renderList()
            }
        } catch (e) {
            if (!me.isDestroyed && generation === me.generation) {
                me.getReference('list').html = `<div class="go-empty">${escapeHtml(e.message || String(e))}</div>`
            }
        }
    }

    renderList() {
        let me   = this,
            text = String(me.getReference('searchField').value || '').trim().toLowerCase();

        me.shown = text
            ? me.links.filter(({link, to}) => [to?.name, to?.description, link.description].some(v => v && String(v).toLowerCase().includes(text)))
            : me.links;

        me.getReference('list').html = me.shown.length
            ? renderLinks(me.shown)
            : `<div class="go-empty">${escapeHtml(t('No items found'))}</div>`
    }
}

export default Neo.setupClass(LinkBrowser);
