import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {t}          from './util.mjs';

/**
 * CSV export of a domain's mailboxes (GOUI MailboxExportDialog), optionally with new
 * passwords. GO exports in the background and reports the file as an Alert; the dialog
 * waits for it and offers the file as a link (a download started after the request
 * would not count as a user action).
 *
 *     Neo.create(MailboxExportDialog, {appName, windowId, domain})  // domain: MailDomain
 */
class MailboxExportDialog extends Dialog {
    static config = {
        className   : 'GO.maildomains.view.MailboxExportDialog',
        cls         : ['go-md-export'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : false,
        wrapperStyle: {left: 'calc(50vw - 320px)', maxWidth: '100vw', top: '20vh', width: '640px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Object|null} domain=null
         */
        domain: null
    }

    construct(config) {
        config.title ??= t('Export domain:') + ' ' + (config.domain?.domain || '');

        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            cls   : ['go-md-dialog-form'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'component',
                tag  : 'p',
                text : t('If you enable reset passwords then a new password will be generated and exported for each account. Warning! Existing client configuration will need to be updated after this action.')
            }, {
                module    : BoolCheckBox,
                reference : 'resetPasswords',
                valueLabel: t('Reset passwords')
            }, {
                ntype    : 'component',
                reference: 'result',
                cls      : ['go-md-export-result'],
                hidden   : true
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : t('Close'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'exportButton',
                text     : t('Export'),
                handler  : () => me.export()
            }]
        }]
    }

    async export() {
        let me     = this,
            button = me.getReference('exportButton'),
            reset  = me.getReference('resetPasswords').checked;

        if (button.disabled) {
            return
        }

        button.disabled = true;
        me.showResult(`<span class="go-md-muted">${escapeHtml(t('Exporting'))}…</span>`);

        try {
            // all mailboxes of the domain (GOUI: the loaded rows only)
            const {ids} = await client.call('MailBox/query', {filter: {domainId: me.domain.id}}),
                  columns = ['username', 'email', 'name', 'active', ...reset ? ['password'] : []];

            if (!ids.length) {
                throw new Error(t("There's nothing to export"))
            }

            const before = new Set(await me.alertIds());

            // GO 26 exports after the response and reports the file as an Alert (and e-mail)
            await client.call('MailBox/export', {ids, extension: 'csv', columns});

            // a second click would reset the passwords again
            reset && !me.isDestroyed && (me.getReference('resetPasswords').checked = false);

            const blob = await me.waitForExport(before);

            if (me.isDestroyed) {
                return
            }

            if (blob) {
                const url = client.apiUrl + 'download.php?blob=' + encodeURIComponent(blob.id);
                me.showResult(`<i class="go-icon">download</i> <a href="${escapeHtml(url)}" download="${escapeHtml(blob.name)}">${escapeHtml(blob.name)}</a>`)
            } else {
                me.showResult(escapeHtml(t('The export has started in the background')))
            }
        } catch (e) {
            me.isDestroyed || me.showResult(`<span class="go-md-error">${escapeHtml(e.message || String(e))}</span>`)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }

    /**
     * @param {String} html
     */
    showResult(html) {
        const result = this.getReference('result');

        result.html   = html;
        result.hidden = !html
    }

    /**
     * @returns {Promise<String[]>} ids of the user's alerts
     */
    async alertIds() {
        const {ids} = await client.call('Alert/query', {filter: {userId: client.user?.id}});
        return ids || []
    }

    /**
     * Polls the user's alerts for the new "Export finished" one (AbstractConverter::notifyEnd(),
     * its body links download.php?blob=…)
     * @param {Set<String>} before alert ids before the export
     * @returns {Promise<{id: String, name: String}|null>} null: not finished within a minute,
     * or more exports finished at once
     */
    async waitForExport(before) {
        let me = this;

        for (let i = 0; i < 60 && !me.isDestroyed; i++) {
            await me.timeout(1000);

            const ids = (await me.alertIds()).filter(id => !before.has(String(id)));

            if (!ids.length || me.isDestroyed) {
                continue
            }

            // userId: SingleOwnerEntity's permission check reads it
            const {list} = await client.call('Alert/get', {ids, properties: ['id', 'userId', 'data']});

            // MailBox exports only ("MailBox-<date>.csv"); another one finishing meanwhile
            // (other tab) makes it ambiguous: then no link, the alert / e-mail has it
            const exports = (list || []).map(alert => {
                const data  = typeof alert.data === 'string' ? JSON.parse(alert.data || '{}') : alert.data || {},
                      match = String(data.body || '').match(/blob=([^"&]+)[^>]*>([^<]*)</),
                      name  = match ? match[2].replace(/^\s*\S+\s/, '').trim() : ''; // "Download name.csv"

                return match && name.startsWith('MailBox-') ? {id: decodeURIComponent(match[1]), name} : null
            }).filter(Boolean);

            if (exports.length) {
                return exports.length === 1 ? exports[0] : null
            }
        }

        return null
    }
}

export default Neo.setupClass(MailboxExportDialog);
