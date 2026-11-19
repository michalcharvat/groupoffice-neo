import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {fmt, t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import Tree          from '../../../../../views/neo/src/tree/Tree.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import {isValidName, toTreeNode} from '../util.mjs';

const t = translator('legacy', 'files');

/**
 * Picks a files folder (ExtJS GO.files.SelectFolderDialog), optionally with a file name
 * (ExtJS GO.files.SaveAsDialog). Only real folders can be chosen, not "Shared" or the trash;
 * the server checks the permission when the caller writes into the folder.
 *
 *     const folder = await SelectFolderDialog.ask({appName, windowId})
 *     // {id: 12, path: 'users/john/Documents'} or null when cancelled
 *     const target = await SelectFolderDialog.ask({appName, windowId, title: t('Save file'), fileName: 'report.pdf'})
 *     // {id, path, fileName}
 *
 * Other modules open it through the registry: ModuleRegistry.getConfigs('selectFolder')[0](config).
 */
class SelectFolderDialog extends Dialog {
    static config = {
        className   : 'GO.files.view.SelectFolderDialog',
        cls         : ['go-files-select-dialog'],
        modal       : true,
        headerConfig: headerTools('maximize', 'close'),
        title       : t('Select folder...'),
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
         * Ask for a file name too (save as): the suggested name, null for a folder only
         * @member {String|null} fileName=null
         */
        fileName: null
    }

    /**
     * {id, path, fileName?} once OK was clicked, null otherwise
     * @member {Object|null} answer=null
     */
    answer = null
    /**
     * Chosen tree node
     * @member {Object|null} selectedNode=null
     */
    selectedNode = null
    /**
     * OK is being handled (existence check, overwrite question)
     * @member {Boolean} checking=false
     */
    checking = false

    construct(config) {
        super.construct(config);

        let me       = this,
            withName = me.fileName !== null && me.fileName !== undefined;

        me.items = [{
            ntype : 'container',
            cls   : ['go-scroll'],
            flex  : 1,
            items : [{
                module      : Tree,
                reference   : 'tree',
                cls         : ['go-files-tree'],
                defaultIcon : 'folder',
                nodeProvider: async node => {
                    const nodes = await client.legacy('files/folder/tree', {node: node ? node.id : 'root'});
                    // no trash: nothing can be saved there
                    return (Array.isArray(nodes) ? nodes : []).filter(n => n.id !== 'trash').map(toTreeNode)
                }
            }]
        }, {
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-files-select-name'],
            flex     : 'none',
            hidden   : !withName,
            keys     : {Enter: () => me.onOk()},
            items    : withName ? [{
                module       : TextField,
                name         : 'fileName',
                reference    : 'fileName',
                labelText    : coreT('Name'),
                labelPosition: 'inline',
                value        : me.fileName,
                required     : true
            }] : []
        }, {
            ntype    : 'component',
            reference: 'error',
            cls      : ['go-form-error'],
            flex     : 'none',
            text     : ''
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                reference: 'okButton',
                ui       : 'primary',
                text     : coreT('Ok'),
                disabled : true,
                handler  : () => me.onOk()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            tree = me.getReference('tree');

        tree.on('itemClick', ({record}) => {
            const node = record && tree.getNode(record.id);

            // "Shared" and the root of other users' shares are no folders
            me.selectedNode = node && /^\d+$/.test(node.id) ? node : null;
            me.getReference('okButton').disabled = !me.selectedNode;
            me.showError('')
        })
    }

    /**
     * @param {String} text
     */
    showError(text) {
        const error = this.getReference('error');
        error && (error.text = text)
    }

    async onOk() {
        let me   = this,
            node = me.selectedNode;

        if (!node || me.checking) {
            return
        }

        me.checking = true;

        try {
            await me.submit(node)
        } finally {
            me.isDestroyed || (me.checking = false)
        }
    }

    /**
     * @param {Object} node chosen tree node
     * @returns {Promise<void>}
     */
    async submit(node) {
        let me = this;

        const answer = {id: Number(node.id), path: node.path || ''};

        if (me.fileName !== null && me.fileName !== undefined) {
            const fileName = String(me.getReference('fileName').value || '').trim();

            if (!isValidName(fileName)) {
                me.showError(t('Invalid file or folder name'));
                return
            }

            // the server overwrites an existing file: ask first like ExtJS SaveAsDialog
            let exists;

            try {
                exists = await me.fileExists(answer.id, fileName)
            } catch (e) {
                me.isDestroyed || me.showError(e.message || String(e));
                return
            }

            if (me.isDestroyed) {
                return
            }

            if (exists) {
                const overwrite = await ConfirmDialog.ask({
                    appName : me.appName,
                    windowId: me.windowId,
                    message : fmt(t('{filename} already exists, do you want to overwrite the file?'), {filename: fileName})
                });

                if (!overwrite || me.isDestroyed) {
                    return
                }
            }

            answer.fileName = fileName
        }

        me.answer = answer;
        me.close()
    }

    /**
     * Whether the folder has a file with this name: its direct files from the tree route
     * (not the search, which goes through the index and pages)
     * @param {Number} folderId
     * @param {String} fileName
     * @returns {Promise<Boolean>}
     */
    async fileExists(folderId, fileName) {
        const nodes = await client.legacy('files/folder/tree', {node: folderId, showFiles: 1});
        return (Array.isArray(nodes) ? nodes : []).some(n => n.leaf && n.name === fileName)
    }

    /**
     * @param {Object} config appName, windowId, title, fileName
     * @returns {Promise<Object|null>} {id, path, fileName?}, null when cancelled
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(SelectFolderDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(SelectFolderDialog);
