import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import TextArea     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {fmt}        from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {dkimPatch, saveDkim} from './dkim.mjs';
import ImportDkimKeyDialog from './ImportDkimKeyDialog.mjs';
import {moduleSettings, statusIcon, t} from './util.mjs';

/**
 * DNS records of a domain (GOUI DnsSettingsPanel): SPF, DMARC and MX as the last DNS
 * check found them, each with its status, and the DKIM keys: enabled switch, status,
 * the TXT record to publish (copy button), delete; add (the server generates the key)
 * or import a private key. DKIM changes are saved right away.
 *
 * The selector of an existing key is read only (GOUI: renaming it creates a new key).
 *
 * Events: change {} after a DKIM change was saved
 */
class DnsSettingsPanel extends Container {
    static config = {
        className: 'GO.maildomains.view.DnsSettingsPanel',
        baseCls  : ['go-md-dns', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            ntype : 'container',
            cls   : ['go-md-dns-records'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : ['spf', 'dmarc', 'mx'].map(name => ({
                ntype : 'container',
                cls   : ['go-md-dns-record'],
                layout: {ntype: 'hbox', align: 'start'},
                items : [{
                    ntype : 'container',
                    flex  : 1,
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [{
                        module          : TextField,
                        reference       : name,
                        labelText       : name.toUpperCase(),
                        labelPosition   : 'inline',
                        readOnly        : true,
                        clearable       : false,
                        flex            : 'none',
                        placeholderText : {
                            spf  : 'v=spf1 a:smtp.example.com a:smtp2.example.com ip4: ip4: -all',
                            dmarc: 'v=DMARC1; p=quarantine; rua=postmaster@example.com',
                            mx   : 'smtp.example.com'
                        }[name]
                    }, {
                        // GOUI setInvalid(): neo's `error` is dropped on a field that was not mounted yet
                        ntype    : 'component',
                        reference: name + 'Error',
                        cls      : ['go-md-dns-error'],
                        hidden   : true,
                        text     : ''
                    }]
                }, {
                    ntype    : 'component',
                    reference: name + 'Status',
                    cls      : ['go-md-dns-status'],
                    flex     : 'none',
                    html     : ''
                }]
            }))
        }, fieldset(t('DKIM keys'), [{
            ntype    : 'container',
            reference: 'dkimList',
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : []
        }, {
            ntype    : 'component',
            reference: 'dkimEmpty',
            cls      : ['go-empty'],
            flex     : 'none',
            text     : t('No items to display')
        }, {
            module: Toolbar,
            flex  : 'none',
            items : [{
                module   : Button,
                icon     : 'cloud_upload',
                reference: 'importButton',
                text     : t('Import private key'),
                handler  : 'up.onImport'
            }, '->', {
                module   : Button,
                icon     : 'add',
                ui       : 'primary',
                reference: 'addKeyButton',
                text     : t('Add'),
                handler  : 'up.onAddKey'
            }]
        }])]
    }

    /**
     * Shown domain
     * @member {Object|null} domain=null
     */
    domain = null

    /**
     * Module setting mailHost, for the SPF message
     * @member {String} mailHost=''
     */
    mailHost = ''

    /**
     * May the user change the DKIM keys (last setDomain())
     * @member {Boolean} mayWrite=false
     */
    mayWrite = false

    /**
     * A DKIM change is being saved: every change sends the whole map, built from the
     * shown domain, so the next one waits for the saved state
     * @member {Boolean} saving=false
     */
    saving = false

    onConstructed() {
        super.onConstructed();

        moduleSettings('community', 'maildomains').then(settings => {
            this.mailHost = settings.mailHost || '';
            this.domain && !this.isDestroyed && this.showRecords(this.domain)
        })
    }

    /**
     * @param {Object|null} domain MailDomain
     * @param {Boolean} [mayWrite=true]
     */
    setDomain(domain, mayWrite = true) {
        let me = this;

        me.domain   = domain;
        me.mayWrite = mayWrite;

        me.getReference('importButton').disabled = !domain || !mayWrite;
        me.getReference('addKeyButton').disabled = !domain || !mayWrite;

        me.showRecords(domain);
        me.showDkim(domain, mayWrite)
    }

    /**
     * SPF, DMARC, MX with GOUI's messages
     * @param {Object|null} domain
     */
    showRecords(domain) {
        let me = this;

        const messages = {
            spf  : [t('Your SPF record is not set'), fmt(t("Your SPF record does not allow '{mailhost}'"), {mailhost: me.mailHost})],
            dmarc: [t('Your DMARC record is not set'), t('Your DMARC record is invalid')],
            mx   : [t('Your MX record is not set'), t('Your MX record is not set to this mailserver')]
        };

        Object.entries(messages).forEach(([name, [notSet, invalid]]) => {
            const field = me.getReference(name),
                  value = domain?.[name] || '',
                  ok    = !!domain?.[name + 'Status'];

            const error = me.getReference(name + 'Error'),
                  text  = domain && !ok ? (value ? invalid : notSet) : '';

            field.value  = value;
            error.text   = text;
            error.hidden = !text;
            me.getReference(name + 'Status').html = domain ? statusIcon(ok) : ''
        })
    }

    /**
     * A row per DKIM key
     * @param {Object|null} domain
     * @param {Boolean} mayWrite
     */
    showDkim(domain, mayWrite) {
        let me   = this,
            list = me.getReference('dkimList'),
            keys = Object.values(domain?.dkim || {});

        list.removeAll();
        me.getReference('dkimEmpty').hidden = keys.length > 0;

        keys.length && list.add(keys.map(key => ({
            ntype : 'container',
            cls   : ['go-md-dkim-key'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype : 'container',
                cls   : ['go-md-dkim-head'],
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module       : TextField,
                    labelText    : t('Selector'),
                    labelPosition: 'inline',
                    readOnly     : true,
                    clearable    : false,
                    flex         : 1,
                    value        : key.selector
                }, {
                    module    : BoolCheckBox,
                    valueLabel: t('Enabled'),
                    flex      : 'none',
                    checked   : !!key.enabled,
                    disabled  : !mayWrite,
                    listeners : {change: ({value}) => me.setEnabled(key.selector, value)}
                }, {
                    ntype: 'component',
                    cls  : ['go-md-dns-status'],
                    flex : 'none',
                    html : statusIcon(!!key.status)
                }, {
                    module  : Button,
                    icon    : 'delete',
                    tooltip : t('Delete'),
                    flex    : 'none',
                    disabled: !mayWrite,
                    handler : () => me.deleteKey(key.selector)
                }]
            }, {
                ntype : 'container',
                cls   : ['go-md-dkim-dns'],
                layout: {ntype: 'hbox', align: 'start'},
                items : [{
                    module       : TextArea,
                    // the record name, then GOUI's value (DkimKey::getDNS())
                    labelText    : t('DNS TXT record') + ' ' + key.selector + '._domainkey',
                    labelPosition: 'inline',
                    readOnly     : true,
                    flex         : 1,
                    height       : 120,
                    value        : key.DNS || ''
                }, {
                    module : Button,
                    icon   : 'content_copy',
                    tooltip: t('Copy to clipboard'),
                    flex   : 'none',
                    handler: data => me.copyDns(data.component)
                }]
            }]
        })))
    }

    /**
     * Selects the text area next to the button and copies it
     * @param {Neo.component.Base} button
     */
    async copyDns(button) {
        let me    = this,
            row   = Neo.getComponent(button.parentId),
            area  = row?.items.find(item => item instanceof TextArea),
            id    = area?.getInputElId();

        if (!id) {
            return
        }

        try {
            await Neo.main.DomAccess.selectNode({appName: me.appName, windowId: me.windowId, id});
            await Neo.main.DomAccess.execCommand({appName: me.appName, windowId: me.windowId, command: 'copy'})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {Object} dkim the new DKIM map
     */
    /**
     * Saves the DKIM map, then shows the saved domain before the next change is allowed
     * @param {Object} dkim the new DKIM map
     */
    async save(dkim) {
        let me = this,
            id = me.domain?.id;

        if (me.saving || !id) {
            return
        }

        me.saving    = true;
        me.isLoading = true;

        try {
            await saveDkim(id, dkim)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }

        try {
            // also after a failure: shows the saved state again
            const [domain] = await client.get('MailDomain', [id]);

            !me.isDestroyed && me.domain?.id === id && domain && me.setDomain(domain, me.mayWrite)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            if (!me.isDestroyed) {
                me.saving    = false;
                me.isLoading = false;
                // the detail (header status) and the list follow
                me.fire('change', {})
            }
        }
    }

    setEnabled(selector, enabled) {
        const dkim = dkimPatch(this.domain?.dkim);

        if (dkim[selector] && dkim[selector].enabled !== !!enabled) {
            dkim[selector].enabled = !!enabled;
            this.save(dkim)
        }
    }

    async deleteKey(selector) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to delete the selected item?')
        });

        if (!confirmed || me.isDestroyed || !me.domain || me.saving) {
            return
        }

        const dkim = dkimPatch(me.domain.dkim);
        delete dkim[selector];
        me.save(dkim)
    }

    /**
     * GOUI: a new key "mail<n>"; the server generates the key pair
     */
    onAddKey() {
        let me   = this,
            dkim = dkimPatch(me.domain?.dkim),
            n    = Object.keys(dkim).length + 1;

        if (!me.domain || me.saving) {
            return
        }

        while (dkim['mail' + n]) {
            n++
        }

        dkim['mail' + n] = {selector: 'mail' + n, enabled: false};
        me.save(dkim)
    }

    onImport() {
        let me = this;

        if (!me.domain || me.saving) {
            return
        }

        Neo.create(ImportDkimKeyDialog, {appName: me.appName, windowId: me.windowId, domain: me.domain})
            .on('close', () => me.isDestroyed || me.fire('change', {}))
    }
}

export default Neo.setupClass(DnsSettingsPanel);
