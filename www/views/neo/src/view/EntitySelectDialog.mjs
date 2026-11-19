import Toolbar         from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button          from '../button/Button.mjs';
import EntityCheckList from '../form/field/EntityCheckList.mjs';
import {t} from '../Translate.mjs';
import Dialog, {headerTools} from './Dialog.mjs';

/**
 * Picks entities from a checkbox list (ExtJS go.form.multiselect.Field in a dialog), e.g.
 * the task lists of the start page's tasks portlet.
 *
 *     const ids = await EntitySelectDialog.ask({appName, windowId, title: t('Visible lists'),
 *         entity: 'TaskList', jmapFilter: {role: 'list'}, value: ['1', '5']})   // null: cancelled
 */
class EntitySelectDialog extends Dialog {
    static config = {
        className: 'GO.view.EntitySelectDialog',
        cls      : ['go-entity-select-dialog'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: true,
        title    : '',
        wrapperStyle: {
            height   : '500px',
            left     : 'calc(50vw - 250px)',
            maxHeight: '90vh',
            maxWidth : '100vw',
            top      : 'max(5vh, calc(50vh - 250px))',
            width    : '500px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * @member {Object} jmapFilter={}
         */
        jmapFilter: {},
        /**
         * Checked ids
         * @member {Array} value=[]
         */
        value: []
    }

    /**
     * Checked ids, null when cancelled
     * @member {Array|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module    : EntityCheckList,
            reference : 'list',
            flex      : 1,
            entity    : me.entity,
            jmapFilter: me.jmapFilter,
            value     : (me.value || []).map(String)
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Save'),
                handler: () => {
                    me.answer = [...me.getReference('list').value || []];
                    me.close()
                }
            }]
        }]
    }

    /**
     * @param {Object} config appName, windowId, title, entity, jmapFilter, value
     * @returns {Promise<Array|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(EntitySelectDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(EntitySelectDialog);
