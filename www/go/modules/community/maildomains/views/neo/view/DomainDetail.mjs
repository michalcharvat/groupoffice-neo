import Container   from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar     from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import client      from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {fmt}       from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import MailAliasModel from '../model/MailAlias.mjs';
import MailBoxModel   from '../model/MailBox.mjs';
import AliasDialog    from './AliasDialog.mjs';
import DnsSettingsPanel from './DnsSettingsPanel.mjs';
import DomainDialog   from './DomainDialog.mjs';
import DomainGridCard from './DomainGridCard.mjs';
import MailboxDialog  from './MailboxDialog.mjs';
import MailboxExportDialog from './MailboxExportDialog.mjs';
import {dateRenderer, domainStatusHtml, loadPrincipalNames, principalName, principalRenderer, quotaRenderer,
        t, usageRenderer, yesNoRenderer} from './util.mjs';

/** GOUI datecolumn: created/modified columns of both grids */
const auditColumns = hidden => [{
    dataField: 'createdAt',
    text     : t('Created at'),
    cellAlign: 'right',
    width    : 120,
    hidden,
    renderer : dateRenderer
}, {
    dataField: 'createdBy',
    stateKey : 'creator',
    text     : t('Created by'),
    width    : 160,
    hidden   : true,
    sortable : false,
    renderer : principalRenderer
}, {
    dataField: 'modifiedAt',
    text     : t('Modified at'),
    cellAlign: 'right',
    width    : 120,
    hidden,
    renderer : dateRenderer
}, {
    dataField: 'modifiedBy',
    stateKey : 'modifier',
    text     : t('Modified by'),
    width    : 160,
    hidden   : true,
    sortable : false,
    renderer : principalRenderer
}];

/**
 * Right pane: the selected domain (GOUI DomainDetail): owner and quota, the DNS
 * records with a DNS check, the mailboxes and the aliases. Toolbar: edit, more
 * (export mailboxes, delete).
 *
 * Events: change {} (the domain was changed here), delete {domain} (the domain was deleted)
 */
class DomainDetail extends Container {
    static config = {
        className: 'GO.maildomains.view.DomainDetail',
        cls      : ['go-md-detail'],
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
                disabled : true,
                handler  : 'up.onEdit'
            }, {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More'),
                disabled : true
            }]
        }, {
            ntype    : 'container',
            cls      : ['go-detail-scroller'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'scroller',
            items    : [{
                ntype    : 'component',
                reference: 'header',
                cls      : ['go-card', 'go-md-header'],
                flex     : 'none',
                html     : ''
            }, {
                ntype    : 'container',
                reference: 'dnsCard',
                cls      : ['go-card', 'go-md-dns-card'],
                flex     : 'none',
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : [{
                    module: Toolbar,
                    flex  : 'none',
                    items : [{
                        ntype: 'component',
                        tag  : 'h3',
                        cls  : ['go-toolbar-heading'],
                        text : t('DNS Settings')
                    }, '->', {
                        module   : Button,
                        icon     : 'refresh',
                        reference: 'checkDnsButton',
                        tooltip  : t('Check DNS'),
                        disabled : true,
                        handler  : 'up.onCheckDns'
                    }]
                }, {
                    module   : DnsSettingsPanel,
                    reference: 'dns',
                    flex     : 'none'
                }]
            }, {
                module      : DomainGridCard,
                reference   : 'mailboxes',
                flex        : 'none',
                title       : t('Mailboxes'),
                entity      : 'MailBox',
                model       : MailBoxModel,
                sortProperty: 'username',
                gridStateId : 'maildomains-mailboxes',
                recordTitle : record => record.username,
                gridColumns : [{
                    dataField: 'id',
                    text     : 'ID',
                    cellAlign: 'right',
                    width    : 80,
                    hidden   : true
                }, {
                    dataField: 'username',
                    text     : t('Username'),
                    flex     : 1,
                    hideable : false,
                    renderer : ({value}) => escapeHtml(value)
                }, {
                    dataField: 'description',
                    text     : t('Description'),
                    width    : 200,
                    renderer : ({value}) => escapeHtml(value)
                }, {
                    dataField: 'quota',
                    text     : t('Quota'),
                    width    : 120,
                    renderer : quotaRenderer
                }, {
                    dataField: 'bytes',
                    text     : t('Usage'),
                    width    : 120,
                    sortable : false,
                    renderer : usageRenderer
                }, {
                    dataField: 'active',
                    text     : t('Active'),
                    width    : 100,
                    sortable : false,
                    renderer : yesNoRenderer
                }, ...auditColumns(true)]
            }, {
                module      : DomainGridCard,
                reference   : 'aliases',
                flex        : 'none',
                title       : t('Aliases'),
                entity      : 'MailAlias',
                model       : MailAliasModel,
                sortProperty: 'address',
                gridStateId : 'maildomains-aliases',
                recordTitle : record => record.address,
                gridColumns : [{
                    dataField: 'id',
                    text     : 'ID',
                    cellAlign: 'right',
                    width    : 80,
                    hidden   : true
                }, {
                    dataField: 'address',
                    text     : t('Address'),
                    flex     : 1,
                    hideable : false,
                    // "@example.com" is the catch all
                    renderer : ({value}) => escapeHtml(value?.charAt(0) === '@' ? '*' + value : value)
                }, {
                    dataField: 'recipients',
                    text     : t('Goto'),
                    flex     : 1,
                    sortable : false,
                    renderer : ({value}) => escapeHtml((value || []).join(', '))
                }, ...auditColumns(false), {
                    dataField: 'active',
                    text     : t('Active'),
                    width    : 100,
                    sortable : false,
                    renderer : yesNoRenderer
                }]
            }]
        }]
    }

    /**
     * Shown domain (MailDomain/get, all properties)
     * @member {Object|null} domain=null
     */
    domain = null

    /**
     * Id of the domain last asked for with load(), shown or still loading
     * @member {String|null} requestedId=null
     */
    requestedId = null

    /**
     * Open dialogs, closed with the detail
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('mailboxes').on({
            add : ()         => me.openMailboxDialog(null),
            edit: ({record}) => me.openMailboxDialog(record.id)
        });

        me.getReference('aliases').on({
            add : ()         => me.openAliasDialog(null),
            edit: ({record}) => me.openAliasDialog(record.id)
        });

        me.getReference('dns').on('change', () => me.onChanged());

        // nothing selected yet
        me.setDomain(null);

        // quota sums, DNS state and DKIM keys change with the domain, its mailboxes and aliases
        me.removeStateListener = client.on('stateChange', ({changed}) => {
            me.domain && changed.some(e => ['MailDomain', 'MailBox', 'MailAlias'].includes(e)) && me.reload()
        })
    }

    destroy(...args) {
        this.removeStateListener?.();
        // close(), not destroy(): it removes the modal mask and the dialog's DOM
        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
    }

    /**
     * @param {GO.view.Dialog} dialog
     * @returns {GO.view.Dialog}
     */
    trackDialog(dialog) {
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    /**
     * Loads and shows a domain, null: none
     * @param {String|null} id
     * @returns {Promise<Object|null>}
     */
    async load(id) {
        let me         = this,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1;

        me.requestedId = id ? String(id) : null;

        if (!id) {
            me.setDomain(null);
            return null
        }

        try {
            const [domain] = await client.get('MailDomain', [String(id)]);

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            await loadPrincipalNames([domain?.userId]);
            me.isDestroyed || generation !== me.loadGeneration || me.setDomain(domain || null);
            return domain || null
        } catch (e) {
            me.isDestroyed || notifyError(me, e);
            return null
        }
    }

    reload() {
        return this.load(this.requestedId)
    }

    /**
     * The domain was changed here (edit, DKIM, DNS check): reload it and tell the list
     * (its status column), which may not get a push
     * @returns {Promise<Object|null>}
     */
    onChanged() {
        this.fire('change', {});
        return this.reload()
    }

    /**
     * @param {Object|null} domain
     */
    setDomain(domain) {
        let me    = this,
            level = domain?.permissionLevel || 0;

        me.domain = domain;

        me.getReference('editButton').disabled     = !domain || level < LEVEL_WRITE;
        me.getReference('moreButton').disabled     = !domain;
        me.getReference('checkDnsButton').disabled = !domain || level < LEVEL_WRITE;
        me.getReference('moreButton').menu = [
            {text: t('Export'), icon: 'import_export', handler: () => me.onExport()},
            {text: t('Delete'), icon: 'delete', disabled: level < LEVEL_DELETE, handler: () => me.onDelete()}
        ];

        me.getReference('header').html = domain ? me.renderHeader(domain) : '';
        me.getReference('dns').setDomain(domain, level >= LEVEL_WRITE);
        me.getReference('mailboxes').setDomain(domain?.id || null);
        me.getReference('aliases').setDomain(domain?.id || null);

        // nothing selected: the cards below stay hidden
        ['header', 'dnsCard', 'mailboxes', 'aliases'].forEach(ref => me.getReference(ref).hidden = !domain)
    }

    /**
     * GOUI: status, domain, description; owner and quotas
     * @param {Object} domain
     * @returns {String} html
     */
    renderHeader(domain) {
        const item = (label, value) => `<div class="go-md-header-item"><label>${escapeHtml(label)}</label><span>${escapeHtml(value)}</span></div>`;

        return `
            <div class="go-md-header-title">
                ${domainStatusHtml(domain)}
                <div>
                    <h3>${escapeHtml(domain.domain)}</h3>
                    ${domain.description ? `<small>${escapeHtml(domain.description)}</small>` : ''}
                </div>
            </div>
            <div class="go-md-header-items">
                ${item(t('User'), principalName(domain.userId) || t('Not found'))}
                ${item(t('Quota'), quotaRenderer({value: domain.totalQuota}))}
                ${item(t('Used quota'), usageRenderer({value: domain.sumUsedQuota}))}
            </div>`
    }

    onEdit() {
        let me = this;

        if (!me.domain) {
            return
        }

        me.trackDialog(Neo.create(DomainDialog, {appName: me.appName, windowId: me.windowId, entityId: me.domain.id}))
            .on('save', () => me.onChanged())
    }

    async onCheckDns() {
        let me     = this,
            button = me.getReference('checkDnsButton'),
            card   = me.getReference('dnsCard');

        if (!me.domain || button.disabled) {
            return
        }

        button.disabled = true;
        card.isLoading  = t('Loading...');

        try {
            await client.set('MailDomain', {update: {[me.domain.id]: {checkDNS: true}}});
            me.isDestroyed || notify(me, t('DNS check completed'));
            await me.onChanged()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            if (!me.isDestroyed) {
                card.isLoading  = false;
                button.disabled = !me.domain || (me.domain.permissionLevel || 0) < LEVEL_WRITE
            }
        }
    }

    onExport() {
        let me = this;

        me.domain && me.trackDialog(Neo.create(MailboxExportDialog, {appName: me.appName, windowId: me.windowId, domain: me.domain}))
    }

    async onDelete() {
        let me     = this,
            domain = me.domain;

        if (!domain || (domain.permissionLevel || 0) < LEVEL_DELETE) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: domain.domain})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.set('MailDomain', {destroy: [domain.id]});
            // also drops a pending load and requestedId
            me.load(null);
            me.fire('delete', {domain})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {String|null} id null: new mailbox with the domain's default quota
     */
    openMailboxDialog(id) {
        let me = this;

        me.domain && me.trackDialog(Neo.create(MailboxDialog, {
            appName : me.appName,
            windowId: me.windowId,
            domain  : me.domain.domain,
            entityId: id,
            values  : {domainId: me.domain.id, quota: me.domain.defaultQuota || 0, active: true, autoExpunge: '30d'}
        })).on('save', () => me.isDestroyed || me.getReference('mailboxes').reload())
    }

    /**
     * @param {String|null} id
     */
    openAliasDialog(id) {
        let me = this;

        me.domain && me.trackDialog(Neo.create(AliasDialog, {
            appName : me.appName,
            windowId: me.windowId,
            domain  : me.domain.domain,
            entityId: id,
            values  : {domainId: me.domain.id, recipients: [], active: true}
        })).on('save', () => me.isDestroyed || me.getReference('aliases').reload())
    }
}

export default Neo.setupClass(DomainDetail);
