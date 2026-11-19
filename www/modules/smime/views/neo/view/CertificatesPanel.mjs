import Container     from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import {download}    from '../../../../../views/neo/src/download.mjs';
import {formatUserDateTime} from '../../../../../views/neo/src/Format.mjs';
import ActionTable   from '../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import * as api      from '../api.mjs';
import {t, LEVEL_WRITE} from '../api.mjs';

/**
 * The PKCS#12 certificates of an e-mail account in its account dialog (ExtJS smime
 * PluginAccountDialog "PKCS12 certificates" grid): upload, download and delete. Old
 * certificates stay to decrypt old mail; the newest one signs and decrypts new mail.
 *
 *     panel.setAccount(accountId, level)
 *
 * Fires `change {count}` after a load (the "Always sign" checkbox needs a certificate).
 */
class CertificatesPanel extends Container {
    static config = {
        className: 'GO.smime.CertificatesPanel',
        cls      : ['go-smime-certificates'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @member {Number|null} accountId=null
     */
    accountId = null
    /**
     * The user's permission level on the account
     * @member {Number} level=0
     */
    level = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                ntype: 'component',
                cls  : ['go-smime-certificates-title'],
                text : t('PKCS12 certificates'),
                flex : 1
            }, {
                module   : Button,
                reference: 'uploadButton',
                icon     : 'upload',
                text     : t('Upload certificate'),
                disabled : true,
                handler  : () => me.upload()
            }]
        }, {
            // a scrolling box: the table itself would stretch its rows over the height
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                columns  : [
                    {text: t('Serial number'), field: 'serial', flex: true},
                    {text: t('Valid from'), render: r => formatUserDateTime(r.valid_since)},
                    {text: t('Valid to'), render: r => formatUserDateTime(r.valid_until)},
                    {text: t('Issuer'), field: 'provided_by'}
                ],
                actions: [
                    {action: 'download', icon: 'download', tooltip: t('Download certificate')},
                    {action: 'delete', icon: 'delete', tooltip: t('Delete certificate'), hidden: () => me.level < LEVEL_WRITE}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('table').on('action', ({action, record}) => {
            action === 'download' && download(me.windowId, api.downloadUrl(record.id)).catch(e => notifyError(me, e));
            action === 'delete' && me.deleteCertificate(record)
        })
    }

    /**
     * @param {Number|null} accountId
     * @param {Number} level the user's permission level on the account
     * @returns {Promise<void>}
     */
    async setAccount(accountId, level) {
        let me = this;

        me.accountId = accountId;
        me.level     = level;
        me.getReference('uploadButton').disabled = !accountId || level < LEVEL_WRITE;
        await me.load()
    }

    /**
     * @returns {Promise<void>}
     */
    async load() {
        let me      = this,
            records = [];

        if (me.accountId) {
            try {
                records = await api.certificates(me.accountId)
            } catch (e) {
                notifyError(me, e)
            }
        }

        if (!me.isDestroyed) {
            me.getReference('table').records = records;
            me.fire('change', {count: records.length})
        }
    }

    async upload() {
        let me = this;

        const {default: UploadDialog} = await import('./UploadDialog.mjs'),
              dialog = Neo.create(UploadDialog, {appName: me.appName, windowId: me.windowId, accountId: me.accountId});

        dialog.on('save', () => me.isDestroyed || me.load())
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
            title   : t('Delete certificate'),
            // the dialog shows text, not HTML
            message : t('Old SMIME certificates are needed to decrypt old e-mail') + '. ' + t('Are you sure you want to delete this?')
        });

        if (!ok || me.isDestroyed) {
            return
        }

        try {
            await api.deleteCertificate(record.id)
        } catch (e) {
            notifyError(me, e)
        }

        me.isDestroyed || me.load()
    }
}

export default Neo.setupClass(CertificatesPanel);
