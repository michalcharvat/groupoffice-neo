import client         from '../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {t as coreT, translator} from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'summary');

const CAPABILITY = 'go:legacy:summary';

/**
 * Login of the last unread check: one per login, not per window
 * @type {Number|null}
 */
let checkedUserId = null;

ModuleRegistry.register({
    package   : 'legacy',
    name      : 'summary',
    title     : t('Start page'),
    iconCls   : 'fa fa-house',
    capability: CAPABILITY,
    // Material icon in the header's main menu
    icon      : 'home',
    // one view per window (docs/neo-workspace.md, Phase 3 part 3): the start page's portlet layout is one state
    singleInstance: true,
    mainView  : () => import('./view/StartPage.mjs'),
    // GO.summary.portlets of the summary module itself; other modules register theirs
    portlets  : [{
        id   : 'portlet-announcements',
        title: t('Announcements'),
        icon : 'campaign',
        view : () => import('./view/AnnouncementsPortlet.mjs')
    }, {
        id   : 'portlet-note',
        title: t('Notes'),
        icon : 'edit_note',
        view : () => import('./view/NotePortlet.mjs')
    }, {
        id   : 'portlet-rss-reader',
        title: t('News'),
        icon : 'rss_feed',
        view : () => import('./view/RssPortlet.mjs')
    }, {
        // appointments of the calendars chosen in the portlet (su_visible_calendars)
        id       : 'portlet-calendar',
        title    : coreT('Appointments'),
        icon     : 'today',
        available: () => client.hasCapability('go:community:calendar'),
        view     : () => import('./view/CalendarPortlet.mjs')
    }],
    // MainPanel.js: a new announcement opens the start page once after login
    onMainView: async mainView => {
        const userId = client.user?.id;

        if (checkedUserId === userId) {
            return
        }

        checkedUserId = userId;

        try {
            const {has_unread} = await client.legacy('summary/announcement/checkLatestRead');
            has_unread && !mainView.isDestroyed && Neo.Main.setRoute({value: 'summary', windowId: mainView.windowId})
        } catch (e) {
            console.warn('Checking announcements failed', e)
        }
    }
});
