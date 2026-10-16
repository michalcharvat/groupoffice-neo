import Component from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {logoUrl, safeUrl, t} from '../util.mjs';

/**
 * The bookmarks grouped by category (GOUI BookmarksGridView / BookmarksColumnView):
 * "grid" shows tiles with logo, name and description below a heading per category,
 * "columns" one column per category with logo and name.
 *
 * A bookmark is a link (<a href>): one that opens in a new tab is left to the browser,
 * the others fire `open`. Right click fires `contextMenu`.
 *
 * Events:
 * - open        {bookmark}
 * - contextMenu {bookmark, targetId}
 */
class BookmarksView extends Component {
    static config = {
        className: 'GO.bookmarks.BookmarksView',
        baseCls  : ['go-bookmarks-view'],
        /**
         * 'grid' or 'columns'
         * @member {String} mode_='grid'
         */
        mode_: 'grid',
        _vdom: {cn: []}
    }

    /**
     * Shown bookmarks by id
     * @member {Map<String, Object>} bookmarks
     */
    bookmarks = new Map()

    construct(config) {
        super.construct(config);

        let me = this;

        // links that open inside GO, and the browser menu on all of them
        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'click',       cls: ['go-bookmark-internal'], windowId: me.windowId});
        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-bookmark'],          windowId: me.windowId});

        me.addDomListeners({
            click      : me.onItemClick,
            contextmenu: me.onItemContextMenu,
            scope      : me
        })
    }

    afterSetMode(value, oldValue) {
        let me  = this,
            cls = me.cls.filter(c => !c.startsWith('go-bookmarks-mode-'));

        me.cls = [...cls, 'go-bookmarks-mode-' + value]
    }

    /**
     * @param {Object[]} bookmarks sorted by category
     * @param {Map<String, String>} categoryNames id → name
     */
    setBookmarks(bookmarks, categoryNames) {
        let me       = this,
            sections = [],
            section;

        me.bookmarks = new Map(bookmarks.map(b => [String(b.id), b]));

        bookmarks.forEach(bookmark => {
            const categoryId = String(bookmark.categoryId);

            if (!section || section.categoryId !== categoryId) {
                section = {categoryId, items: []};
                sections.push(section)
            }

            section.items.push(me.createItem(bookmark))
        });

        me.vdom.cn = sections.length ? sections.map(({categoryId, items}) => ({
            cls: ['go-bookmarks-section'],
            cn : [
                {tag: 'h3', cls: ['go-bookmarks-category'], text: escapeHtml(categoryNames.get(categoryId) || '')},
                {cls: ['go-bookmarks-items'], cn: items}
            ]
        })) : [{cls: ['go-empty'], text: escapeHtml(t('No items to display'))}];

        me.update()
    }

    /**
     * @param {Object} bookmark
     * @returns {Object} vdom
     * @protected
     */
    createItem(bookmark) {
        const url      = safeUrl(bookmark.content),
              logo     = logoUrl(bookmark.logo),
              external = !!bookmark.openExtern;

        return {
            tag  : 'a',
            id   : this.getItemId(bookmark.id),
            cls  : ['go-bookmark', external ? 'go-bookmark-external' : 'go-bookmark-internal'],
            href : url || undefined,
            // the URL is shown by the browser's status bar; the title shows a cut description
            title : bookmark.description || bookmark.name,
            ...(external && url ? {target: '_blank', rel: 'noopener noreferrer'} : {}),
            cn   : [
                logo
                    ? {tag: 'img', cls: ['go-bookmark-logo'], src: logo, alt: ''}
                    : {tag: 'i', cls: ['go-bookmark-logo', 'go-icon'], text: 'bookmark'},
                {cls: ['go-bookmark-text'], cn: [
                    {tag: 'h4', cls: ['go-bookmark-name'], text: escapeHtml(bookmark.name)},
                    {cls: ['go-bookmark-desc'], text: escapeHtml(bookmark.description || '')}
                ]}
            ]
        }
    }

    /**
     * @param {String} bookmarkId
     * @returns {String} DOM id of its link
     */
    getItemId(bookmarkId) {
        return `${this.id}__bm-${bookmarkId}`
    }

    /**
     * @param {Object} data dom event
     * @returns {{bookmark: Object, node: Object}|null}
     * @protected
     */
    getEventBookmark(data) {
        const prefix = this.id + '__bm-',
              node   = data.path?.find(node => node.id?.startsWith(prefix)),
              bookmark = node && this.bookmarks.get(node.id.substring(prefix.length));

        return bookmark ? {bookmark, node} : null
    }

    onItemClick(data) {
        const hit = this.getEventBookmark(data);

        // external links are opened by the browser (target _blank)
        if (hit && hit.node.cls.includes('go-bookmark-internal')) {
            this.fire('open', {bookmark: hit.bookmark})
        }
    }

    onItemContextMenu(data) {
        const hit = this.getEventBookmark(data);

        hit && this.fire('contextMenu', {bookmark: hit.bookmark, targetId: hit.node.id})
    }
}

export default Neo.setupClass(BookmarksView);
