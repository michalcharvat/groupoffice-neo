import Container from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml, formatDate, userFormat} from '../../../../../../../views/neo/src/Format.mjs';
import {parseYmd}  from '../../../../../../../views/neo/src/DateUtil.mjs';
import CommentsPanel from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import FilesPanel    from '../../../../../../../views/neo/src/detail/FilesPanel.mjs';
import HistoryPanel  from '../../../../../../../views/neo/src/detail/HistoryPanel.mjs';
import DateField     from '../../../../../../../views/neo/src/form/field/DateField.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import AddLinkButton    from '../../../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkDetail       from '../../../../../../../views/neo/src/link/LinkDetail.mjs';
import DetailFieldsets  from '../../../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {contactAvatarHtml, downloadUrl, t, transformUrl, typeName} from '../util.mjs';

const GENDERS = {M: 'Male', F: 'Female', N: 'Non-binary', P: "Won't say"};

/**
 * @param {String|null} ymd
 * @returns {String} the date in the user's format
 */
const formatYmd = ymd => {
    const date = parseYmd(ymd);
    return date ? formatDate(date, userFormat.dateFormat) : ''
};

/**
 * Right pane: the selected contact (ExtJS ContactDetail): name with avatar, e-mail
 * addresses, phone numbers, addresses, dates, address book, company details, notes,
 * then the action date, custom fields, comments, files, links and history.
 *
 * Events: edit {contact}, more {contact, target} (the more button), star {contact}
 */
class ContactDetail extends Container {
    static config = {
        className: 'GO.addressbook.view.ContactDetail',
        baseCls  : ['go-addressbook-detail', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            cls      : ['go-border-bottom'],
            flex     : 'none',
            reference: 'toolbar',
            items    : ['->', {
                module   : Button,
                icon     : 'star_border',
                reference: 'starButton',
                tooltip  : t('Star'),
                disabled : true,
                handler  : 'up.onStar'
            }, {
                module   : Button,
                icon     : 'edit',
                reference: 'editButton',
                tooltip  : t('Edit'),
                disabled : true,
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
                tooltip  : t('More'),
                disabled : true,
                handler  : 'up.onMore'
            }]
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
                // ExtJS addActionDate(): saved right away
                ntype    : 'container',
                reference: 'actionDateCard',
                cls      : ['go-card', 'go-pad', 'go-addressbook-action-date'],
                flex     : 'none',
                hidden   : true,
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : [{
                    ntype: 'component',
                    tag  : 'h3',
                    text : t('Action date')
                }, {
                    module       : DateField,
                    reference    : 'actionDate',
                    labelText    : t('Action date'),
                    labelPosition: 'inline',
                    hideLabel    : true,
                    width        : 200
                }]
            }, {
                module   : DetailFieldsets,
                reference: 'customFields',
                flex     : 'none'
            }, {
                module   : CommentsPanel,
                reference: 'comments',
                flex     : 'none',
                hidden   : true
            }, {
                module   : FilesPanel,
                reference: 'files',
                flex     : 'none',
                hidden   : true
            }, {
                module   : LinkDetail,
                reference: 'links',
                flex     : 'none'
            }, {
                module   : HistoryPanel,
                reference: 'history',
                flex     : 'none',
                hidden   : true
            }]
        }]
    }

    /**
     * @member {Object|null} contact=null
     */
    contact = null

    /**
     * Address book names by id (the detail shows the contact's address book)
     * @member {Map} addressBookNames
     */
    addressBookNames = new Map()

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('actionDate').on('change', ({value}) => me.onActionDateChange(value))
    }

    /**
     * @param {Object|null} contact
     */
    async setContact(contact) {
        let me    = this,
            level = contact?.permissionLevel || 0,
            id    = contact?.id || null;

        me.contact = contact;

        me.getReference('editButton').disabled = !contact || level < LEVEL_WRITE;
        me.getReference('moreButton').disabled = !contact;
        me.getReference('starButton').disabled = !contact;
        me.showStarred(!!contact?.starred);

        me.getReference('addLinkButton').setEntity(contact ? 'Contact' : null, id);

        if (me.getReference('linkBrowseButton').target?.entityId !== id) {
            me.getReference('linkBrowseButton').setEntity(contact ? 'Contact' : null, id)
        }

        if (me.getReference('links').current?.entityId !== id) {
            me.getReference('links').setEntity(contact ? 'Contact' : null, id, contact)
        }

        me.getReference('customFields').setEntity(contact ? 'Contact' : null, id);

        ['comments', 'files', 'history'].forEach(ref => {
            const card = me.getReference(ref);

            card.hidden = !contact;

            if (card.current?.entityId !== id) {
                card.setEntity(contact ? 'Contact' : null, id, contact)
            } else if (contact) {
                card.current.record = contact
            }
        });

        const actionCard = me.getReference('actionDateCard');
        actionCard.hidden = !contact;

        if (contact) {
            // no change event: setting the loaded value is not an edit
            me.settingActionDate = true;
            me.getReference('actionDate').set({value: contact.actionAt || null, readOnly: level < LEVEL_WRITE});
            me.settingActionDate = false
        }

        if (!contact) {
            me.getReference('body').html = '';
            return
        }

        me.getReference('body').html = me.renderContact(contact, await me.getAddressBookName(contact.addressBookId));
    }

    async getAddressBookName(id) {
        let me = this;

        if (!id) {
            return ''
        }

        if (!me.addressBookNames.has(String(id))) {
            try {
                const [ab] = await client.get('AddressBook', [id], ['id', 'name']);
                me.addressBookNames.set(String(id), ab?.name || '')
            } catch (e) {
                return ''
            }
        }

        return me.addressBookNames.get(String(id))
    }

    /**
     * @param {Object} c contact
     * @param {String} addressBookName
     * @returns {String} HTML, user data escaped
     */
    renderContact(c, addressBookName) {
        const e     = escapeHtml,
              color = c.color ? ` style="color:#${e(String(c.color).replace(/[^0-9a-f]/gi, ''))}"` : '',
              list  = (icon, rows) => rows.length ? `<div class="go-addressbook-icons">${rows.map((row, i) => `
                    <div class="go-addressbook-icon-row">
                        <i class="go-icon">${i === 0 ? icon : ''}</i>
                        <div>${row}</div>
                    </div>`).join('')}</div>` : '',
              item  = (html, label) => `<span class="go-addressbook-value">${html}</span><label>${e(label)}</label>`;

        const avatar = contactAvatarHtml(c, ['go-addressbook-avatar']),
              title  = [c.prefixes, c.name, c.suffixes].filter(Boolean).join(' '),
              sub    = [c.jobTitle, c.department].filter(Boolean).join(' - '),
              urls   = (c.urls || []).map(u => `<a class="go-addressbook-url" href="${e(transformUrl(u.url, u.type))}" target="_blank" rel="noopener" title="${e(typeName('urlTypes', u.type))}: ${e(u.url)}"><i class="go-icon">${u.type === 'homepage' ? 'home' : 'link'}</i></a>`).join('');

        const emails = (c.emailAddresses || []).map(m => item(`<a href="mailto:${e(m.email)}">${e(m.email)}</a>`, typeName('emailTypes', m.type))),
              phones = (c.phoneNumbers || []).map(p => item(`<a href="tel:${e(String(p.number || '').replace(/[^0-9+]/g, ''))}">${e(p.number)}</a>`, typeName('phoneTypes', p.type))),
              addresses = (c.addresses || []).map(a => {
                  const text = a.formatted || [a.address, [a.zipCode, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean).join('\n');
                  return item(`<a class="go-addressbook-address" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text.replace(/\n/g, ', '))}" target="_blank" rel="noopener">${e(text)}</a>`, typeName('addressTypes', a.type))
              }),
              dates  = (c.dates || []).map(d => item(e(formatYmd(d.date)), typeName('dateTypes', d.type))),
              other  = [];

        addressBookName && other.push(item(e(addressBookName), t('Address book')));
        GENDERS[c.gender] && !c.isOrganization && other.push(item(e(t(GENDERS[c.gender])), t('Gender')));

        const company = [
            c.IBAN && ['IBAN', c.IBAN],
            c.BIC && ['BIC', c.BIC],
            c.vatNo && [t('VAT number'), c.vatNo],
            (c.IBAN || c.vatNo || c.registrationNumber || c.debtorNumber || c.vatReverseCharge) && [t('Reverse charge VAT'), c.vatReverseCharge ? t('Yes') : t('No')],
            c.registrationNumber && [t('Registration number'), c.registrationNumber],
            c.debtorNumber && [t('Customer number'), c.debtorNumber]
        ].filter(Boolean);

        return `
            <div class="go-card go-pad go-addressbook-contact">
                <div class="go-addressbook-name-panel">
                    ${c.photoBlobId ? `<a href="${e(downloadUrl(c.photoBlobId, true))}" target="_blank" rel="noopener">${avatar}</a>` : avatar}
                    <div class="go-addressbook-name">
                        <h3${color}>${e(title)}</h3>
                        ${sub ? `<h4>${e(sub)}</h4>` : ''}
                    </div>
                    ${urls ? `<div class="go-addressbook-urls">${urls}</div>` : ''}
                </div>
                ${list('email', emails)}
                ${list('phone', phones)}
                ${list('location_on', addresses)}
                ${list('cake', dates)}
                ${list('import_contacts', other)}
            </div>
            ${company.length ? `
            <div class="go-card go-pad go-addressbook-company">
                <h3>${e(t('Company'))}</h3>
                <dl class="go-dl">${company.map(([term, value]) => `<dt>${e(term)}</dt><dd>${e(value)}</dd>`).join('')}</dl>
            </div>` : ''}
            ${c.notes ? `
            <div class="go-card go-pad go-addressbook-notes">
                <h3>${e(t('Notes'))}</h3>
                <div class="go-addressbook-notes-text">${e(c.notes)}</div>
            </div>` : ''}`
    }

    async onActionDateChange(value) {
        let me      = this,
            contact = me.contact;

        if (me.settingActionDate || !contact || (contact.actionAt || null) === (value || null)) {
            return
        }

        try {
            await client.set('Contact', {update: {[contact.id]: {actionAt: value || null}}});
            notify(me, t('Saved successfully'), {title: t('Success')})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {Boolean} starred
     */
    showStarred(starred) {
        const button = this.getReference('starButton');

        button.set({
            icon   : starred ? 'star' : 'star_border',
            tooltip: starred ? t('Unstar') : t('Star')
        });
        // Material Symbols draw "star" outlined too: go-starred fills it
        starred ? button.addCls('go-starred') : button.removeCls('go-starred')
    }

    onEdit() {
        this.contact && this.fire('edit', {contact: this.contact})
    }

    onStar() {
        // the record's starred lags behind until the push reload: the button knows
        this.contact && this.fire('star', {contact: this.contact, starred: this.getReference('starButton').icon !== 'star'})
    }

    onMore() {
        this.contact && this.fire('more', {contact: this.contact, target: this.getReference('moreButton').id})
    }
}

export default Neo.setupClass(ContactDetail);
