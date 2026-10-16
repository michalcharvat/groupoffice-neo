import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../button/Button.mjs';
import client        from '../../jmap/Client.mjs';
import ActionTable   from '../../list/ActionTable.mjs';
import {notifyError} from '../../Notify.mjs';
import {t}           from '../../Translate.mjs';
import Dialog        from '../../view/Dialog.mjs';

/**
 * Exports field sets of an entity to a JSON file (go.customfields.ExportDialog):
 * check the field sets, FieldSet/exportToJson, download the blob.
 */
class ExportDialog extends Dialog {
    static config = {
        className   : 'GO.customfields.admin.ExportDialog',
        cls         : ['go-cf-export-dialog'],
        modal       : true,
        wrapperStyle: {left: 'max(0px, calc(50vw - 260px))', top: '15vh', width: 'min(520px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * @member {String|null} forEntity=null
         */
        forEntity: null,
        /**
         * @member {String|null} entityTitle=null
         */
        entityTitle: null,
        /**
         * The entity's field sets
         * @member {Object[]} fieldSets=[]
         */
        fieldSets: []
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = t('Export fieldsets to JSON-file') + ': ' + (me.entityTitle || me.forEntity);

        me.items = [{
            module   : ActionTable,
            reference: 'table',
            flex     : 'none',
            cls      : ['go-cf-export-table'],
            columns  : [
                {text: t('Export'), field: 'export', type: 'check'},
                {text: t('Fieldset'), field: 'name', flex: true}
            ],
            records  : me.fieldSets.map(fs => ({id: fs.id, name: fs.name, export: true}))
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
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
        let me          = this,
            button      = me.getReference('exportButton'),
            fieldSetIds = me.getReference('table').records.filter(r => r.export).map(r => r.id);

        if (!fieldSetIds.length) {
            return
        }

        button.disabled = true;

        try {
            const {blobId} = await client.call('FieldSet/exportToJson', {entity: me.forEntity, fieldSetIds});

            if (!me.isDestroyed) {
                Neo.Main.redirectTo({url: client.apiUrl + 'download.php?blob=' + encodeURIComponent(blobId), windowId: me.windowId});
                me.close()
            }
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(ExportDialog);
