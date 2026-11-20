import Container     from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml, sanitizeHtml, smartDateTime} from '../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {translator}  from '../../../../../views/neo/src/Translate.mjs';
import {parseFeed}   from '../rss.mjs';

const t = translator('legacy', 'summary');

/** items shown per feed */
const MAX_ITEMS = 15;

/**
 * "News" portlet (GO.portlets.rssFeedPortlet in a tab panel): the user's RSS feeds as tabs,
 * the items of the active one. Feeds load through summary/rssFeed/proxy (the server fetches
 * them, only from public addresses). "Settings" manages the feeds.
 */
class RssPortlet extends Container {
    static config = {
        className: 'GO.summary.RssPortlet',
        cls      : ['go-rss-portlet'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            reference: 'tabs',
            cls      : ['go-rss-tabs'],
            flex     : 'none',
            hidden   : true,
            items    : []
        }, {
            ntype    : 'component',
            reference: 'items',
            cls      : ['go-portlet-list'],
            html     : ''
        }]
    }

    /**
     * su_rss_feeds rows of the user: {id, title, url, summary}
     * @member {Object[]} feeds=[]
     */
    feeds = []

    /**
     * @member {Number|null} activeFeedId=null
     */
    activeFeedId = null

    onConstructed() {
        super.onConstructed();
        this.refresh()
    }

    async refresh() {
        let me = this;

        try {
            const {results = []} = await client.legacy('summary/rssFeed/store');

            if (me.isDestroyed) {
                return
            }

            me.feeds = results;

            const tabs = me.getReference('tabs');

            tabs.removeAll();
            tabs.hidden = results.length < 2;
            tabs.add(results.map(feed => ({
                module : Button,
                text   : feed.title || feed.url,
                cls    : ['go-rss-tab'],
                feedId : feed.id,
                handler: () => me.showFeed(feed.id)
            })));

            if (!results.length) {
                me.setHtml(`<div class="go-empty">${escapeHtml(t('No RSS feeds have been added.<br />Click the settings button in the top right corner of this window to add feeds.').replace(/<br\s*\/?>/g, ' '))}</div>`);
                return
            }

            me.showFeed(results.some(f => f.id === me.activeFeedId) ? me.activeFeedId : results[0].id)
        } catch (e) {
            me.isDestroyed || me.setHtml(`<div class="go-empty">${escapeHtml(e.message)}</div>`)
        }
    }

    setHtml(html) {
        this.getReference('items').html = html
    }

    async showFeed(id) {
        let me   = this,
            feed = me.feeds.find(f => f.id === id);

        me.activeFeedId = id;
        me.getReference('tabs').items.forEach(button => button.pressed = button.feedId === id);

        if (!feed) {
            return
        }

        me.setHtml(`<div class="go-empty">${escapeHtml(t('Loading Feed...'))}</div>`);

        try {
            const {items} = parseFeed(await client.legacyText('summary/rssFeed/proxy', {feed: feed.url}));

            if (me.isDestroyed || me.activeFeedId !== id) {
                return
            }

            me.setHtml(items.length ? items.slice(0, MAX_ITEMS).map(item => {
                const link  = item.link && /^https?:\/\//i.test(item.link) ? item.link : null,
                      title = escapeHtml(item.title || item.link || '');

                return `<div class="go-rss-item">
                    <div class="go-rss-item-head">
                        ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${title}</a>` : `<b>${title}</b>`}
                        <span class="go-portlet-meta">${escapeHtml(item.date ? smartDateTime(+item.date) : '')}</span>
                    </div>
                    ${feed.summary && item.description ? `<div class="go-rss-item-text go-html">${sanitizeHtml(item.description)}</div>` : ''}
                </div>`
            }).join('') : `<div class="go-empty">${escapeHtml(t('No items to display'))}</div>`)
        } catch (e) {
            me.isDestroyed || me.activeFeedId !== id || me.setHtml(`<div class="go-empty">${escapeHtml(e.message)}</div>`)
        }
    }

    async openSettings() {
        let me = this;

        const {default: FeedsDialog} = await import('./FeedsDialog.mjs');

        Neo.create(FeedsDialog, {appName: me.appName, windowId: me.windowId}).on('saved', () => me.refresh())
    }
}

export default Neo.setupClass(RssPortlet);
