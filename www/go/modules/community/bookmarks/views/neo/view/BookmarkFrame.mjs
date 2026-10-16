import Container from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../../../../../../../views/neo/src/button/Button.mjs';
import client    from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {safeUrl, t} from '../util.mjs';

/**
 * A bookmark's web page inside GO (ExtJS GO.panel.IFrameComponent): a toolbar with
 * the name and "open in a new tab", below it the page in an iframe.
 *
 * Shown by the bookmarks module for bookmarks that don't open in a new tab
 * (`back` event from its back button), and as the main view of a bookmark that
 * behaves as a module (moduleName "bookmarks-<id>", see Index.mjs).
 */
class BookmarkFrame extends Container {
    static config = {
        className: 'GO.bookmarks.BookmarkFrame',
        baseCls  : ['go-bookmark-frame', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Shows the back button (inside the bookmarks module)
         * @member {Boolean} showBack=false
         */
        showBack: false,
        /**
         * Set by the shell for a bookmark that behaves as a module
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-bg-mid', 'go-border-bottom'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'arrow_back',
                tooltip: t('Back'),
                hidden : !me.showBack,
                handler: () => me.fire('back')
            }, {
                ntype    : 'component',
                tag      : 'h3',
                cls      : ['go-toolbar-heading'],
                reference: 'title'
            }, '->', {
                module   : Button,
                icon     : 'open_in_new',
                reference: 'openButton',
                tooltip  : t('Open in new browser tab'),
                // a real link: window.open() from the worker may be blocked as a popup
                urlTarget: '_blank'
            }]
        }, {
            ntype    : 'component',
            tag      : 'iframe',
            reference: 'frame',
            cls      : ['go-bookmark-iframe'],
            flex     : 1
        }]
    }

    onConstructed() {
        super.onConstructed();

        const match = this.moduleName?.match(/^bookmarks-(\d+)$/);
        match && this.loadBookmark(match[1])
    }

    /**
     * @param {String} id
     */
    async loadBookmark(id) {
        let me = this;

        try {
            const [bookmark] = await client.get('Bookmark', [id], ['id', 'name', 'content']);
            me.isDestroyed || me.setBookmark(bookmark || null)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object|null} bookmark
     */
    setBookmark(bookmark) {
        let me     = this,
            url    = safeUrl(bookmark?.content),
            frame  = me.getReference('frame'),
            button = me.getReference('openButton');

        me.bookmark = bookmark;
        me.getReference('title').text = escapeHtml(bookmark?.name || '');

        button.url    = url;
        button.hidden = !url;

        frame.vdom.src = url || 'about:blank';
        frame.vdom.title = bookmark?.name || '';
        frame.update()
    }
}

export default Neo.setupClass(BookmarkFrame);
