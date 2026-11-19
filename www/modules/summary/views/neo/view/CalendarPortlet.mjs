import Component     from '../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {escapeHtml}  from '../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {resolveRoute} from '../../../../../views/neo/src/link/linkTypes.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'summary');
import EntitySelectDialog from '../../../../../views/neo/src/view/EntitySelectDialog.mjs';

/**
 * "Appointments" portlet (GO.summary.CalendarPortlet): the events of today and tomorrow in
 * the calendars chosen with "Settings" (su_visible_calendars, summary/calendar/portletGrid
 * expands recurring events). A click opens the event in the calendar module.
 */
class CalendarPortlet extends Component {
    static config = {
        className: 'GO.summary.CalendarPortlet',
        cls      : ['go-portlet-list', 'go-calendar-portlet'],
        html     : ''
    }

    /**
     * @member {Object[]} records=[]
     */
    records = []

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners([{click: me.onClick, scope: me}]);
        me.removeStateListener = client.on('stateChange', ({changed}) => changed?.includes('CalendarEvent') && me.refresh());
        client.watch(['CalendarEvent']);
        me.refresh()
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    async refresh() {
        let me = this;

        try {
            const {results = []} = await client.legacy('summary/calendar/portletGrid');

            if (me.isDestroyed) {
                return
            }

            me.records = results;

            if (!results.length) {
                me.html = `<div class="go-empty">${escapeHtml(t('No appointments'))}</div>`;
                return
            }

            let day = null;

            me.html = results.map((e, i) => {
                // "Today" / "Tomorrow", translated by the server
                const header = e.day !== day ? `<div class="go-portlet-group">${escapeHtml(day = e.day)}</div>` : '',
                      time   = e.showWithoutTime ? coreT('All day') : String(e.start || '').slice(11, 16) + ' - ' + String(e.end || '').slice(11, 16);

                return `${header}<div class="go-portlet-row" data-index="${i}">
                    <span class="go-portlet-time">${escapeHtml(time)}</span>
                    <span class="go-portlet-text"><b>${escapeHtml(e.title)}</b><small>${escapeHtml([e.location, e.calendar].filter(Boolean).join(' · '))}</small></span>
                </div>`
            }).join('')
        } catch (e) {
            me.isDestroyed || (me.html = `<div class="go-empty">${escapeHtml(e.message)}</div>`)
        }
    }

    onClick({path}) {
        let me     = this,
            index  = path.find(n => n.cls?.includes('go-portlet-row'))?.data?.index,
            record = index !== undefined && me.records[Number(index)],
            route  = record && resolveRoute('CalendarEvent', record.id);

        route && Neo.Main.setRoute({value: route, windowId: me.windowId})
    }

    async openSettings() {
        let me = this;

        try {
            const {results = []} = await client.legacy('summary/calendar/selectedStore', {limit: 1000}),
                  current = results.map(r => String(r.id ?? r.calendar_id));

            const ids = await EntitySelectDialog.ask({
                appName   : me.appName,
                windowId  : me.windowId,
                title     : t('Visible calendars'),
                entity    : 'Calendar',
                jmapFilter: {isSubscribed: true},
                value     : current
            });

            if (!ids) {
                return
            }

            const add    = ids.filter(id => !current.includes(String(id))),
                  remove = current.filter(id => !ids.map(String).includes(id));

            if (add.length || remove.length) {
                await client.legacy('summary/calendar/selectedStore', {
                    add        : JSON.stringify(add.map(Number)),
                    delete_keys: JSON.stringify(remove.map(Number)),
                    limit      : 1000
                });
                me.refresh()
            }
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(CalendarPortlet);
