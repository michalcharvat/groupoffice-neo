import Container     from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import DetailFieldsets from '../../../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import CommentsPanel from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import {escapeHtml, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import LocalCombo    from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import RecurrenceField from '../../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import AddLinkButton from '../../../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkCards     from '../../../../../../../views/neo/src/link/LinkCards.mjs';
import TextList      from '../../../../../../../views/neo/src/list/TextList.mjs';
import {print}       from '../../../../../../../views/neo/src/print.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import CalendarItem, {participantStatusIcon} from '../CalendarItem.mjs';
import calendarData  from '../data.mjs';
import {durationText} from '../util/date.mjs';
import AlertField    from './field/AlertField.mjs';

const t     = translator('community', 'calendar'),
      clone = value => JSON.parse(JSON.stringify(value));

/**
 * An event (GOUI EventDetail): title, calendar, time, recurrence, location, description,
 * participants with their status, attachments; Accept / Maybe / Decline for invitations.
 * Saved right away: the calendar (with mayMove), the user's reminder and, with the module
 * right mayChangeOrganizer, a new organizer. Links, comments and custom fields below.
 *
 * Events: edit {item}, changed {}
 */
class EventDetail extends Container {
    static config = {
        className: 'GO.calendar.EventDetail',
        cls      : ['go-cal-detail'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            cls      : ['go-border-bottom'],
            flex     : 'none',
            reference: 'toolbar',
            items    : ['->', {
                module   : Button,
                icon     : 'edit',
                reference: 'editButton',
                tooltip  : t('Edit'),
                handler  : 'up.onEdit'
            }, {
                module   : AddLinkButton,
                reference: 'addLinkButton'
            }, {
                module   : LinkBrowseButton,
                reference: 'linkBrowseButton'
            }, {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More')
            }]
        }, {
            module   : Toolbar,
            cls      : ['go-cal-status-bar', 'go-border-bottom'],
            flex     : 'none',
            reference: 'statusBar',
            hidden   : true,
            items    : [
                {module: Button, reference: 'accepted', text: t('Accept'), handler: 'up.onAccept'},
                {module: Button, reference: 'tentative', text: t('Maybe'), handler: 'up.onMaybe'},
                {module: Button, reference: 'declined', text: t('Decline'), handler: 'up.onDecline'}
            ]
        }, {
            ntype    : 'container',
            cls      : ['go-detail-scroller'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'scroller',
            items    : [{
                ntype    : 'component',
                reference: 'body',
                flex     : 'none',
                html     : ''
            }, {
                ntype    : 'container',
                reference: 'controls',
                cls      : ['go-card', 'go-pad', 'go-cal-detail-controls'],
                flex     : 'none',
                layout   : {ntype: 'vbox', align: 'stretch'},
                hidden   : true,
                items    : [{
                    module       : LocalCombo,
                    reference    : 'calendarField',
                    flex         : 'none',
                    width        : null,
                    labelText    : t('Calendar'),
                    labelPosition: 'inline',
                    required     : true,
                    displayField : 'name',
                    valueField   : 'id',
                    listConfig   : {module: TextList},
                    store        : {keyProperty: 'id', data: []},
                    listeners    : {change: 'up.onCalendarChange'}
                }, {
                    module       : AlertField,
                    reference    : 'alertField',
                    flex         : 'none',
                    labelPosition: 'inline',
                    listeners    : {change: 'up.onAlertChange'}
                }, {
                    module         : PrincipalCombo,
                    principalEntity: 'User',
                    reference      : 'organizerField',
                    flex           : 'none',
                    labelText      : t('Change organizer'),
                    labelPosition  : 'inline',
                    listeners      : {change: 'up.onOrganizerChange'}
                }]
            }, {
                module   : DetailFieldsets,
                reference: 'customFields',
                flex     : 'none'
            }, {
                module   : LinkCards,
                reference: 'links',
                flex     : 'none'
            }, {
                module   : CommentsPanel,
                reference: 'comments',
                flex     : 'none',
                hidden   : true
            }]
        }]
    }

    /** @member {CalendarItem|null} item */
    item = null

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('moreButton').menu = [
            {text: t('Print'), icon: 'print', handler: () => me.onPrint()},
            {text: t('Download ICS'), icon: 'import_export', handler: () => me.item?.downloadIcs()},
            {separator: true},
            {text: t('Delete'), icon: 'delete', handler: () => me.item?.remove()}
        ];

        // attachment buttons in the body
        me.addDomListeners({click: me.onBodyClick, scope: me});

        me.setItem(null)
    }

    /**
     * @param {CalendarItem|null} item
     */
    async setItem(item) {
        let me   = this,
            id   = item?.data?.id || null,
            real = !!(item && item.key && !item.isNew() && id && item.provider === 'event');

        me.item = item;

        me.getReference('toolbar').hidden = !real;
        me.getReference('editButton').hidden = !real || !item.mayChange;

        me.getReference('addLinkButton').setEntity(real ? 'CalendarEvent' : null, real ? id : null, real ? item.data : null);
        me.getReference('linkBrowseButton').setEntity(real ? 'CalendarEvent' : null, real ? id : null);
        me.getReference('links').setEntity(real ? 'CalendarEvent' : null, real ? id : null, real ? item.data : null);
        me.getReference('customFields').setEntity(real ? 'CalendarEvent' : null, real ? id : null);

        const comments = me.getReference('comments');
        comments.hidden = !real;
        comments.current?.entityId !== id && comments.setEntity(real ? 'CalendarEvent' : null, real ? id : null, real ? item.data : null);

        me.renderStatus();
        me.renderControls();
        me.renderBody()
    }

    /**
     * Whether the reminder is edited below instead of shown in the body
     * @returns {Boolean}
     */
    get alertsEditable() {
        const item = this.item;
        return !!(item && item.key && !item.isNew() && item.provider === 'event' && item.data.id && !item.readOnly)
    }

    /**
     * Calendar, reminder and organizer fields of a saved event (GOUI EventDetail.loadEvent())
     */
    renderControls() {
        let me       = this,
            item     = me.item,
            editable = me.alertsEditable,
            controls = me.getReference('controls');

        controls.hidden = !editable;

        if (!editable) {
            return
        }

        const calendarField  = me.getReference('calendarField'),
              alertField     = me.getReference('alertField'),
              organizerField = me.getReference('organizerField'),
              cal            = item.cal,
              allDay         = !!item.data.showWithoutTime,
              calendarId     = String(item.data.calendarId),
              options        = calendarData.writableCalendars.map(c => ({id: String(c.id), name: c.name}));

        options.some(o => o.id === calendarId) || options.push({id: calendarId, name: cal?.name || t('Calendar')});

        // programmatic values: no saving
        me.silent = true;

        calendarField.hidden = !item.mayMove;
        calendarField.store.data = options;
        calendarField.value = calendarId;

        alertField.fullDay = allDay;
        alertField.setDefaultLabel(allDay ? cal?.defaultAlertsWithoutTime : cal?.defaultAlertsWithTime);
        alertField.value = item.data.useDefaultAlerts ? 'default' : (item.data.alerts || null);

        organizerField.hidden = !item.participants || !item.data.isOrigin || !calendarData.rights.mayChangeOrganizer;
        organizerField.value = null;

        me.silent = false
    }

    renderStatus() {
        let me     = this,
            item   = me.item,
            status = item?.calendarPrincipal?.participationStatus,
            show   = !!(item && item.key && item.participants && item.calendarPrincipal && !item.isOwner);

        me.getReference('statusBar').hidden = !show;

        ['accepted', 'tentative', 'declined'].forEach(s => {
            const b = me.getReference(s);
            b.pressed  = status === s;
            b.disabled = status === s
        })
    }

    renderBody() {
        let me   = this,
            item = me.item,
            body = me.getReference('body');

        if (!item) {
            body.html = '';
            return
        }

        const e     = item.patched,
              cal   = item.cal,
              lines = [];

        lines.push(`<h3>${escapeHtml(item.title || t('Event'))}</h3>`);
        cal?.name && lines.push(`<div class="go-cal-detail-cal"><i class="go-icon" style="color:#${escapeHtml(item.color)}">event</i> ${escapeHtml(cal.name)}</div>`);

        const [line1, line2] = item.humanReadableDate();
        lines.push(`<div class="go-cal-detail-time"><i class="go-icon">schedule</i> <span>${escapeHtml(line1)}<br>${escapeHtml(line2 || '')}</span></div>`);

        if (item.data.recurrenceRule) {
            lines.push(`<div><i class="go-icon">event_repeat</i> ${escapeHtml(RecurrenceField.toText(item.data.recurrenceRule, item.start))}</div>`)
        }

        if (e.location) {
            const loc = /^https?:\/\//.test(e.location)
                ? `<a href="${escapeHtml(e.location)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.location)}</a>`
                : escapeHtml(e.location);
            lines.push(`<div class="go-cal-pre"><i class="go-icon">location_on</i> ${loc}</div>`)
        }

        e.description && lines.push(`<p class="go-cal-detail-desc">${escapeHtml(e.description).replace(/\n/g, '<br>')}</p>`);

        if (e.participants && Object.keys(e.participants).length) {
            const principal = item.calendarPrincipal,
                  rows      = Object.values(e.participants).map(p => {
                      const icon = p.roles?.owner ? 'manage_accounts' : (p.kind === 'resource' ? 'meeting_room' : (p.name ? 'person' : 'contact_mail')),
                            [si, st, sc] = participantStatusIcon(p),
                            you = principal && p.email === principal.email ? ` (${escapeHtml(p.email === calendarData.user.email ? t('You') : t('This'))})` : '';

                      return `<li><i class="go-icon">${icon}</i><span>${escapeHtml(p.name || p.email)}${you}${p.name && p.email ? `<small>${escapeHtml(p.email)}</small>` : ''}</span><i class="go-icon ${sc}" title="${escapeHtml(st)}">${si}</i></li>`
                  });

            lines.push(`<h4>${escapeHtml(t('Participants'))}</h4><ul class="go-cal-detail-participants">${rows.join('')}</ul>`)
        }

        if (item.data.links && Object.keys(item.data.links).length) {
            lines.push(`<h4>${escapeHtml(t('Attachments'))}</h4>` + Object.entries(item.data.links).map(([key, l]) =>
                `<div class="go-cal-attachment"><button type="button" class="go-cal-attachment-file" data-blob="${escapeHtml(l.blobId)}"><i class="go-icon">description</i> ${escapeHtml(l.title)}</button></div>`).join(''))
        }

        if (item.key && item.provider === 'event' && !me.alertsEditable) {
            const alerts = item.data.useDefaultAlerts
                ? (item.data.showWithoutTime ? cal?.defaultAlertsWithoutTime : cal?.defaultAlertsWithTime)
                : item.data.alerts,
                  first  = alerts && Object.values(alerts)[0],
                  text   = first?.trigger?.offset ? durationText(first.trigger.offset) : t('None');

            lines.push(`<div class="go-cal-detail-alert"><i class="go-icon">notifications</i> ${escapeHtml(t('Reminder'))}: ${escapeHtml(text)}${item.data.useDefaultAlerts ? ' (' + escapeHtml(t('Default')) + ')' : ''}</div>`)
        }

        if (item.data.createdAt) {
            lines.push(`<p class="go-cal-detail-meta">${escapeHtml(t('Created at'))}: ${escapeHtml(smartDateTime(item.data.createdAt))}` +
                (item.data.modifiedAt ? `<br>${escapeHtml(t('Modified at'))}: ${escapeHtml(smartDateTime(item.data.modifiedAt))}` : '') + '</p>')
        }

        body.html = `<div class="go-card go-pad">${lines.join('')}</div>`
    }

    onBodyClick(data) {
        const blob = data.path.find(n => n.data?.blob)?.data.blob;

        if (blob) {
            const url = (client.session?.downloadUrl || client.baseUrl + 'api/download.php?blob={blobId}').replace('{blobId}', encodeURIComponent(blob));
            Neo.Main.windowOpen({url, windowName: '_blank', windowId: this.windowId})
        }
    }

    /**
     * Saves a change of the whole event without scheduling messages (GOUI patches the
     * series for the calendar, reminder and organizer too)
     * @param {Object} changes
     * @param {CalendarItem} [item] default the shown one
     * @returns {Promise<Boolean>} saved
     */
    async saveChanges(changes, item = this.item) {
        try {
            await CalendarItem.update(item.data.id, changes, false, item.ui || CalendarItem.ui);
            return true
        } catch (e) {
            // set() showed the error
            return false
        }
    }

    async onCalendarChange() {
        let me         = this,
            item       = me.item,
            calendarId = me.getReference('calendarField').getSubmitValue();

        if (me.silent || !item || String(calendarId) === String(item.data.calendarId)) {
            return
        }

        // cleared: back to the event's calendar
        if (!calendarId) {
            me.renderControls();
            return
        }

        if (await me.saveChanges({calendarId})) {
            item.data.calendarId = item.patched.calendarId = calendarId;
            item.cal = calendarData.getCalendar(calendarId) || item.cal;
            item.calendarIds = {[calendarId]: true};
            item._calendarPrincipal = undefined;
            me.fire('changed', {})
        }

        me.isDestroyed || me.item !== item || me.setItem(item)
    }

    async onAlertChange() {
        let me    = this,
            item  = me.item,
            field = me.getReference('alertField');

        if (me.silent || !item) {
            return
        }

        const useDefaultAlerts = field.useDefault,
              alerts           = useDefaultAlerts ? null : field.getSubmitValue();

        if (await me.saveChanges({useDefaultAlerts, alerts})) {
            Object.assign(item.data, {useDefaultAlerts, alerts});
            me.fire('changed', {})
        }

        me.isDestroyed || me.item !== item || me.renderControls()
    }

    /**
     * The picked user becomes the organizer, the old one an attendee (GOUI changeOrganizer())
     */
    async onOrganizerChange() {
        let me        = this,
            item      = me.item,
            picked    = me.getReference('organizerField').value;

        if (me.silent || !item || !picked?.id) {
            return
        }

        const field = me.getReference('organizerField');

        // one change at a time: a second one would start from the same old participants
        field.disabled = true;

        try {
            await me.changeOrganizer(item, picked)
        } finally {
            if (!me.isDestroyed) {
                field.disabled = false;
                me.item === item && me.setItem(item)
            }
        }
    }

    /**
     * @param {CalendarItem} item
     * @param {Object} picked PrincipalCombo record {id, name}
     */
    async changeOrganizer(item, picked) {
        let me = this;

        // the list record has no e-mail address
        let principal;

        try {
            [principal] = await client.get('Principal', [picked.id], ['id', 'name', 'email', 'type']);
        } catch (e) {
            (item.ui || CalendarItem.ui).error(e);
            return
        }

        if (!principal?.email || me.isDestroyed || me.item !== item) {
            return
        }

        const changes      = {},
              participants = clone(item.data.participants || {});

        const email = principal.email.toLowerCase();

        Object.entries(participants).forEach(([id, p]) => {
            // already invited under another key: replaced by the organizer entry
            if (id !== String(principal.id) && p.kind !== 'resource' && p.email?.toLowerCase() === email) {
                changes[`participants/${id}`] = null;
                delete participants[id]
            } else if (p.roles?.owner) {
                changes[`participants/${id}/roles`] = {attendee: true, owner: null};
                p.roles = {attendee: true}
            }
        });

        const organizer = {
            email              : principal.email,
            name               : principal.name,
            roles              : {attendee: true, owner: true},
            kind               : principal.type || 'individual',
            participationStatus: 'accepted',
            expectReply        : false
        };

        changes[`participants/${principal.id}`] = organizer;
        participants[principal.id] = organizer;

        if (await me.saveChanges(changes, item)) {
            item.data.participants = participants;
            item.patched.participants = clone(participants);
            item._calendarPrincipal = undefined;
            me.isDestroyed || me.fire('changed', {})
        }
    }

    onEdit() {
        this.item && this.fire('edit', {item: this.item})
    }

    updateStatus(status) {
        let me = this;

        me.item?.updateParticipation(status, () => {
            me.isDestroyed || (me.renderStatus(), me.fire('changed', {}))
        }).catch(e => (me.item?.ui || CalendarItem.ui).error(e));
        me.renderStatus()
    }

    /**
     * Prints the event with its cards (GOUI EventDetail print())
     */
    onPrint() {
        this.item && print(this.getReference('scroller'), {title: this.item.title || t('Event')})
    }

    onAccept()  {this.updateStatus('accepted')}
    onMaybe()   {this.updateStatus('tentative')}
    onDecline() {this.updateStatus('declined')}
}

export default Neo.setupClass(EventDetail);
