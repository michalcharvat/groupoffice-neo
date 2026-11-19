import Toolbar      from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../views/neo/src/button/Button.mjs';
import client       from '../../../../../views/neo/src/jmap/Client.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import Tree         from '../../../../../views/neo/src/tree/Tree.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import {toTreeNode} from '../util.mjs';

const t = translator('legacy', 'files');

/**
 * Picks files below a folder with checkboxes (ExtJS GO.email.openFolderTree with
 * GO.files.TreeFilePanel): "E-mail files" of a folder lets the user choose its files first.
 *
 *     const files = await SelectFilesDialog.ask({appName, windowId, folderId: 12})
 *     // [{id, name, path, size, extension}], null when cancelled
 */
class SelectFilesDialog extends Dialog {
    static config = {
        className   : 'GO.files.view.SelectFilesDialog',
        cls         : ['go-files-select-dialog'],
        modal       : true,
        headerConfig: headerTools('maximize', 'close'),
        title       : t('File browser'),
        wrapperStyle: {
            height: 'min(560px, 90vh)',
            left  : 'max(0px, calc(50vw - 220px))',
            top   : 'max(5vh, calc(50vh - 280px))',
            width : 'min(440px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Folder whose files are shown
         * @member {Number|String|null} folderId=null
         */
        folderId: null
    }

    /**
     * Checked files once OK was clicked, null otherwise
     * @member {Object[]|null} answer=null
     */
    answer = null
    /**
     * State of the "Select all" toggle
     * @member {Boolean} allChecked=false
     */
    allChecked = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'refresh',
                text   : coreT('Refresh'),
                handler: () => me.reload()
            }, {
                module   : Button,
                reference: 'selectAllButton',
                icon     : 'done_all',
                text     : coreT('Select all'),
                handler  : () => me.toggleAll()
            }]
        }, {
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module      : Tree,
                reference   : 'tree',
                cls         : ['go-files-tree'],
                defaultIcon : 'folder',
                nodeProvider: async node => {
                    const params = {node: node ? node.id : 'root', showFiles: 1};

                    node || (params.root_folder_id = me.folderId);

                    const nodes = await client.legacy('files/folder/tree', params);
                    return (Array.isArray(nodes) ? nodes : []).map(toTreeNode)
                }
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : coreT('Ok'),
                handler: () => me.onOk()
            }]
        }]
    }

    reload() {
        this.allChecked = false;
        this.getReference('tree').reload().catch(e => console.error('SelectFilesDialog', e))
    }

    /**
     * Checks or unchecks every loaded file (ExtJS: cascade over the loaded nodes)
     */
    toggleAll() {
        let me   = this,
            tree = me.getReference('tree');

        me.allChecked = !me.allChecked;

        [...tree.nodes.values()].filter(node => node.check !== undefined).forEach(node => tree.setChecked(node.id, me.allChecked))
    }

    onOk() {
        let me = this;

        me.answer = me.getReference('tree').getChecked().filter(node => node.fileId).map(node => ({
            id       : node.fileId,
            name     : node.text,
            path     : node.path,
            size     : node.size,
            extension: node.extension
        }));

        me.close()
    }

    /**
     * @param {Object} config appName, windowId, folderId
     * @returns {Promise<Object[]|null>} the checked files, null when cancelled
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(SelectFilesDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(SelectFilesDialog);
