import client       from '../../../../../../../../views/neo/src/jmap/Client.mjs';
import MenuList     from '../../../../../../../../views/neo/src/menu/List.mjs';
import {translator} from '../../../../../../../../views/neo/src/Translate.mjs';
import {participantStatusIcon} from '../../CalendarItem.mjs';
import SuggestField from './SuggestField.mjs';

const t = translator('community', 'calendar');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Participants of an event (GOUI ParticipantField): the list with their status and a
 * menu (optional, remove, write e-mail), an input that suggests users, contacts and
 * resources (Principal) and takes a typed e-mail address on Enter.
 *
 * Value: CalendarEvent.participants, {principalId|email: Participant}.
 *
 * Events: beforeAdd {principal}, availability {ids} (rows marked busy: setBusy())
 */
class ParticipantField extends SuggestField {
    static config = {
        className: 'GO.calendar.field.ParticipantField',
        baseCls  : ['go-field', 'go-cal-suggest', 'go-cal-participants'],
        name     : 'participants'
    }

    /** @member {String|null} organizerId */
    organizerId = null
    /** @member {Object} busy id → true: shown red (not available) */
    busy = {}

    construct(config) {
        config.placeholder ??= t('Invite people') + ' / ' + t('Resource request');
        super.construct(config);
        this.addDomListeners({click: this.onRowMenuClick, delegate: '.go-cal-participant-menu', scope: this})
    }

    beforeSetValue(value) {
        return value && Object.keys(value).length ? Neo.clone(value, true) : null
    }

    get participants() {
        return this.value || {}
    }

    createValueNodes() {
        let me   = this,
            list = Object.entries(me.participants);

        if (!list.length) {
            return []
        }

        return [{
            tag: 'ul',
            cls: ['go-cal-participant-list'],
            cn : list.map(([id, p]) => {
                const icon = p.roles?.owner ? 'manage_accounts' : (p.kind === 'resource' ? 'meeting_room' : (p.name ? 'person' : 'contact_mail')),
                      [statusIcon, statusText, statusCls] = participantStatusIcon(p);

                return {tag: 'li', cn: [
                    {tag: 'i', cls: ['go-icon'], text: icon},
                    {tag: 'span', cls: ['go-cal-participant-name', me.busy[id] ? 'busy' : null].filter(Boolean), cn: [
                        {vtype: 'text', text: p.name || p.email},
                        p.name && p.email ? {tag: 'small', text: p.email} : null,
                        p.roles?.optional ? {tag: 'small', text: t('Optional')} : null
                    ].filter(Boolean)},
                    {tag: 'i', cls: ['go-icon', statusCls], title: statusText, text: statusIcon},
                    me.readOnly ? null : {tag: 'i', id: `${me.id}__pm_${list.findIndex(([k]) => k === id)}`, cls: ['go-icon', 'go-cal-participant-menu'], 'data-pid': id, text: 'more_vert'}
                ].filter(Boolean)}
            })
        }]
    }

    onRowMenuClick(data) {
        let me   = this,
            node = data.path.find(n => n.data?.pid),
            id   = node?.data.pid,
            p    = id && me.participants[id];

        if (!p) {
            return
        }

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : node.id,
            items   : [
                {text: p.email || '', disabled: true},
                {separator: true},
                {text: t('Optional'), icon: p.roles?.optional ? 'check_box' : 'check_box_outline_blank', handler: () => me.toggleOptional(id)},
                {text: t('Delete'), icon: 'delete', handler: () => me.removeParticipant(id)},
                {separator: true},
                {text: t('Write email'), icon: 'email', disabled: !p.email, handler: () => me.fire('writeEmail', {email: p.email})}
            ]
        })
    }

    setParticipants(participants) {
        const value = participants && Object.keys(participants).length ? participants : null;
        this.userChange(value);
        this.renderControl()
    }

    toggleOptional(id) {
        const all = Neo.clone(this.participants, true),
              p   = all[id];

        p.roles = {...(p.roles || {})};
        p.roles.optional ? delete p.roles.optional : (p.roles.optional = true);
        this.setParticipants(all)
    }

    removeParticipant(id) {
        const all = Neo.clone(this.participants, true);

        delete all[id];
        id === this.organizerId && (this.organizerId = null);
        this.setParticipants(all)
    }

    /**
     * Makes a principal the organizer (owner), first in the list
     * @param {Object} p Principal
     */
    addOrganiser(p) {
        let me  = this,
            all = Neo.clone(me.participants, true);

        me.organizerId && me.organizerId !== String(p.id) && delete all[me.organizerId];
        me.organizerId = String(p.id);

        me.setParticipants({
            [p.id]: {
                email              : p.email,
                name               : p.name,
                roles              : {attendee: true, owner: true},
                kind               : p.type || 'individual',
                participationStatus: 'accepted',
                expectReply        : false
            },
            ...Object.fromEntries(Object.entries(all).filter(([k]) => k !== String(p.id)))
        })
    }

    /**
     * @param {Object} principal {id, email, name, type}
     */
    addParticipant(principal) {
        let me = this;

        me.fire('beforeAdd', {principal, empty: !Object.keys(me.participants).length});

        if (String(principal.id) === me.organizerId || me.participants[principal.id]) {
            return
        }

        me.setParticipants({
            ...Neo.clone(me.participants, true),
            [principal.id]: {
                email              : principal.email,
                name               : principal.name || principal.email,
                roles              : {attendee: true},
                kind               : principal.type ?? 'individual',
                participationStatus: 'needs-action',
                expectReply        : true
            }
        })
    }

    async suggest(text) {
        const {list} = await client.queryGet('Principal', {
            filter    : {text, preferUser: true},
            sort      : [{property: 'name'}],
            limit     : 20,
            properties: ['id', 'name', 'email', 'type', 'description']
        });

        return list.filter(p => p.email || p.type === 'resource').map(p => ({
            text: p.name,
            sub : p.email || p.description || '',
            icon: p.type === 'resource' ? 'meeting_room' : 'person',
            data: p
        }))
    }

    onPick(item) {
        this.addParticipant(item.data)
    }

    onFreeText(text) {
        if (!EMAIL.test(text)) {
            return false
        }

        this.addParticipant({id: text, email: text});
        return true
    }

    /**
     * Marks participants that are busy in the period
     * @param {Object} busy id → true
     */
    setBusy(busy) {
        this.busy = busy;
        this.renderControl()
    }
}

export default Neo.setupClass(ParticipantField);
