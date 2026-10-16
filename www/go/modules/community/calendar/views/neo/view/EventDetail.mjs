import Container     from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import DetailFieldsets from '../../../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import CommentsPanel from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import {escapeHtml, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import RecurrenceField from '../../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import AddLinkButton from '../../../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkDetail    from '../../../../../../../views/neo/src/link/LinkDetail.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import CalendarItem, {participantStatusIcon} from '../CalendarItem.mjs';
import calendarData  from '../data.mjs';
import {durationText} from '../util/date.mjs';

const t = translator('community', 'calendar');

/**
 * An event read only (GOUI EventDetail): title, calendar, time, recurrence, location,
 * description, participants with their status, attachments; Accept / Maybe / Decline for
 * invitations, the event's own reminder; links, comments and custom fields below.
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
                module   : DetailFieldsets,
                reference: 'customFields',
                flex     : 'none'
            }, {
                module   : LinkDetail,
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

        ['addLinkButton', 'linkBrowseButton'].forEach(ref => me.getReference(ref).setEntity(real ? 'CalendarEvent' : null, real ? id : null));
        me.getReference('links').setEntity(real ? 'CalendarEvent' : null, real ? id : null, real ? item.data : null);
        me.getReference('customFields').setEntity(real ? 'CalendarEvent' : null, real ? id : null);

        const comments = me.getReference('comments');
        comments.hidden = !real;
        comments.current?.entityId !== id && comments.setEntity(real ? 'CalendarEvent' : null, real ? id : null, real ? item.data : null);

        me.renderStatus();
        me.renderBody()
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

        if (item.key && item.provider === 'event') {
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

    onEdit() {
        this.item && this.fire('edit', {item: this.item})
    }

    updateStatus(status) {
        let me = this;

        me.item?.updateParticipation(status, () => {
            me.isDestroyed || (me.renderStatus(), me.fire('changed', {}))
        }).catch(e => CalendarItem.ui.error(e));
        me.renderStatus()
    }

    onAccept()  {this.updateStatus('accepted')}
    onMaybe()   {this.updateStatus('tentative')}
    onDecline() {this.updateStatus('declined')}
}

export default Neo.setupClass(EventDetail);
