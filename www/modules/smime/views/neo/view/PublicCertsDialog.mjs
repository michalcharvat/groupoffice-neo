import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import SearchButton  from '../../../../../views/neo/src/button/SearchButton.mjs';
import ActionTable   from '../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {fmt, t as coreT} from '../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import * as api      from '../api.mjs';
import {t}           from '../api.mjs';

/**
 * The user's public certificates of other people (ExtJS GO.smime.PublicCertsWindow, opened from
 * the e-mail ⋮ menu): they encrypt mail to these addresses. Import a PEM file, delete, search;
 * the details button (or a double click) shows the certificate.
 *
 *     Neo.create(PublicCertsDialog, {appName, windowId})
 */
class PublicCertsDialog extends Dialog {
    static config = {
        className   : 'GO.smime.PublicCertsDialog',
        cls         : ['go-smime-public-certs'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('maximize', 'close'),
        title       : t('Public SMIME certificates'),
        wrapperStyle: {
            height   : 'min(480px, 90vh)',
            left     : 'max(0px, calc(50vw - 308px))',
            maxHeight: '90vh',
            top      : 'max(5vh, calc(50vh - 240px))',
            width    : 'min(616px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * Search text
     * @member {String} query=''
     */
    query = ''

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'upload_file',
                text   : t('Import'),
                handler: () => me.importCertificate()
            }, '->', {
                module   : SearchButton,
                listeners: {search: ({text}) => {me.query = text || ''; me.load()}}
            }]
        }, {
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                columns  : [{text: t('E-mail'), field: 'email', flex: true}],
                actions  : [
                    {action: 'details', icon: 'info', tooltip: t('Certificate')},
                    {action: 'delete', icon: 'delete', tooltip: coreT('Delete')}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.getReference('table');

        table.on('action', ({action, record}) => {
            action === 'details' && me.showDetails(record);
            action === 'delete' && me.deleteCertificate(record)
        });
        table.on('rowDoubleClick', ({record}) => me.showDetails(record));

        me.load()
    }

    /**
     * @returns {Promise<void>}
     */
    async load() {
        let me = this;

        try {
            const records = await api.publicCertificates(me.query);
            me.isDestroyed || (me.getReference('table').records = records)
        } catch (e) {
            notifyError(me, e)
        }
    }

    async importCertificate() {
        let me = this;

        const {default: ImportDialog} = await import('./ImportDialog.mjs'),
              dialog = Neo.create(ImportDialog, {appName: me.appName, windowId: me.windowId, values: {cert: null, email: ''}});

        dialog.on('save', () => me.isDestroyed || me.load())
    }

    /**
     * @param {Object} record {id, email}
     * @protected
     */
    async showDetails(record) {
        let me = this;

        try {
            const certificate = await api.verify({email: record.email, certId: record.id}),
                  {default: CertificateDetailWindow} = await import('./CertificateDetailWindow.mjs');

            me.isDestroyed || Neo.create(CertificateDetailWindow, {appName: me.appName, windowId: me.windowId, certificate})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {Object} record
     * @protected
     */
    async deleteCertificate(record) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            // the dialog shows text, not HTML
            message : fmt(coreT("Are you sure you want to delete '{item}'?"), {item: record.email})
        });

        if (!ok || me.isDestroyed) {
            return
        }

        try {
            await api.deletePublicCertificates([record.id])
        } catch (e) {
            notifyError(me, e)
        }

        me.isDestroyed || me.load()
    }
}

export default Neo.setupClass(PublicCertsDialog);
