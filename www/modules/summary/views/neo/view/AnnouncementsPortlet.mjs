import Component     from '../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, sanitizeHtml} from '../../../../../views/neo/src/Format.mjs';
import {translator}  from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'summary');

/**
 * "Announcements" portlet (GO.summary.AnnouncementsViewGrid): the announcements the user may
 * read that are not past their "Show until" date, newest first. Loading them marks them
 * read (summary/announcement/store with active=1), like the ExtJS grid.
 */
class AnnouncementsPortlet extends Component {
    static config = {
        className: 'GO.summary.AnnouncementsPortlet',
        cls      : ['go-portlet-list', 'go-announcements-portlet'],
        html     : ''
    }

    onConstructed() {
        super.onConstructed();
        this.refresh()
    }

    async refresh() {
        let me = this;

        try {
            const {results = []} = await client.legacy('summary/announcement/store', {active: 1, limit: 20});

            if (me.isDestroyed) {
                return
            }

            me.html = results.length
                ? results.map(a => `<div class="go-announcement">
                    <div class="go-announcement-title">${escapeHtml(a.title)}</div>
                    <div class="go-announcement-meta">${escapeHtml([a.user_name, a.ctime].filter(Boolean).join(' · '))}</div>
                    <div class="go-announcement-content go-html">${sanitizeHtml(a.content || '')}</div>
                </div>`).join('')
                : `<div class="go-empty">${escapeHtml(t('No announcements'))}</div>`
        } catch (e) {
            me.isDestroyed || (me.html = `<div class="go-empty">${escapeHtml(e.message)}</div>`)
        }
    }
}

export default Neo.setupClass(AnnouncementsPortlet);
