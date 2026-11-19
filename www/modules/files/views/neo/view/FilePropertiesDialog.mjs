import Store        from '../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import TextArea     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField    from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import TextList     from '../../../../../views/neo/src/list/TextList.mjs';
import DescriptionList from '../../../../../views/neo/src/component/DescriptionList.mjs';
import DateField    from '../../../../../views/neo/src/form/field/DateField.mjs';
import LocalCombo   from '../../../../../views/neo/src/form/field/LocalCombo.mjs';
import Grid         from '../../../../../views/neo/src/grid/Grid.mjs';
import client       from '../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, fileSize, formatDate, userFormat} from '../../../../../views/neo/src/Format.mjs';
import {parseYmd}   from '../../../../../views/neo/src/DateUtil.mjs';
import {translator} from '../../../../../views/neo/src/Translate.mjs';
import {decodeEntities, isValidName, splitFileName, userDateToYmd} from '../util.mjs';
import {submitFile} from '../fileHandlers.mjs';
import LegacyFormWindow from './LegacyFormWindow.mjs';

const t = translator('legacy', 'files');

/** LocalCombo option of "no own choice" (the server's default handler) */
const DEFAULT_HANDLER = 'default';

/**
 * File properties (ExtJS GO.files.FilePropertiesDialog, files/file/load|submit): name,
 * comment, content expiry date, the "Open with" default for the file type, and the older
 * versions (files/version/store, double click downloads).
 *
 *     FilePropertiesDialog.open({appName, windowId, fileId})
 */
class FilePropertiesDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.files.view.FilePropertiesDialog',
        cls          : ['go-form-window', 'go-files-properties'],
        title        : t('Properties'),
        wrapperStyle : {height: '75vh', left: 'calc(50vw - 300px)', top: '12vh', width: '600px'},
        generalHeader: {text: t('Properties')},
        /**
         * files/file/load data
         * @member {Object} file={}
         */
        file: {},
        /**
         * Handlers of the file: [{id: cls, name}]
         * @member {Object[]} handlers=[]
         */
        handlers: []
    }

    /**
     * @param {Object} config appName, windowId, fileId
     * @returns {Promise<FilePropertiesDialog>}
     */
    static async open({fileId, ...config}) {
        const [{data}, handlers] = await Promise.all([
            client.legacy('files/file/load', {id: fileId}),
            client.legacy('files/file/handlers', {id: fileId, all: 1}).catch(() => ({results: []}))
        ]);

        const name = decodeEntities(data.name) + (data.extension ? '.' + data.extension : '');

        return Neo.create(FilePropertiesDialog, {
            ...config,
            file    : data,
            handlers: (handlers.results || []).map(h => ({id: h.cls, name: h.name})),
            values  : {
                name,
                comment            : data.comment || '',
                content_expire_date: userDateToYmd(data.content_expire_date, userFormat.dateFormat),
                handlerCls         : data.handlerCls || DEFAULT_HANDLER
            }
        })
    }

    createFormItems() {
        let me   = this,
            file = me.file,
            write = !!file.write_permission && +file.permission_level >= 30;

        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            disabled     : !write,
            validator    : field => isValidName(String(field.value || '')) || t('Invalid file or folder name')
        }, {
            module : DescriptionList,
            records: [
                [t('Location'), decodeEntities(file.path)],
                [t('Type'), file.type],
                [t('Size'), file.size],
                [t('Created at'), file.ctime],
                [t('Created by'), file.username],
                [t('Modified at'), file.mtime],
                [t('Modified by'), file.musername],
                [t('Locked by'), file.locked_user_name]
            ]
        }, {
            module       : LocalCombo,
            name         : 'handlerCls',
            labelText    : t('Open with'),
            labelPosition: 'inline',
            displayField : 'name',
            valueField   : 'id',
            editable     : false,
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: [{id: DEFAULT_HANDLER, name: t('Default')}, ...me.handlers]}
        }, {
            module       : DateField,
            name         : 'content_expire_date',
            labelText    : t('Content expires at'),
            labelPosition: 'inline',
            disabled     : !write
        }, {
            module       : TextArea,
            name         : 'comment',
            labelText    : t('Comment'),
            labelPosition: 'inline',
            height       : 120,
            disabled     : !write
        }]
    }

    onConstructed() {
        const result = super.onConstructed();
        this.addVersionsCard();
        return result
    }

    /**
     * "Older versions" (ExtJS GO.files.VersionsGrid)
     */
    addVersionsCard() {
        let me = this;

        me.addCard({
            header: {text: t('Older versions')},
            items : [{
                module   : Grid,
                reference: 'versionsGrid',
                flex     : 1,
                store    : {
                    module     : Store,
                    keyProperty: 'id',
                    model      : {fields: ['id', 'version', 'user_name', 'size_bytes', 'mtime'].map(name => ({name}))}
                },
                columns: [{
                    dataField: 'version',
                    text     : t('Version'),
                    width    : 90
                }, {
                    dataField: 'user_name',
                    text     : t('Owner'),
                    flex     : 1,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    dataField: 'size_bytes',
                    text     : t('Size'),
                    width    : 100,
                    cellAlign: 'right',
                    renderer : ({value}) => escapeHtml(fileSize(+value || 0))
                }, {
                    dataField: 'mtime',
                    text     : t('Modified at'),
                    width    : 150,
                    cellAlign: 'right',
                    renderer : ({value}) => escapeHtml(value || '')
                }]
            }, {
                ntype: 'component',
                cls  : ['go-hint', 'go-files-versions-hint'],
                flex : 'none',
                text : t('Double click a version to download it')
            }]
        });

        const grid = me.getReference('versionsGrid');

        grid.on('rowDoubleClick', ({record}) => record && Neo.Main.windowOpen({
            url       : client.legacyUrl('files/version/download', {id: record.id}),
            windowName: '_blank',
            windowId  : me.windowId
        }));

        client.legacy('files/version/store', {file_id: me.file.id, sort: 'mtime', dir: 'DESC', limit: 100})
            .then(({results = []}) => {
                me.isDestroyed || (grid.store.data = results)
            })
            .catch(e => me.isDestroyed || me.showError(e.message))
    }

    async save(modified, values) {
        let me     = this,
            file   = me.file,
            params = {id: file.id};

        // file/submit joins name and extension
        'name' in modified && Object.assign(params, splitFileName(modified.name));

        'comment' in modified && (params.comment = modified.comment);

        if ('content_expire_date' in modified) {
            const date = modified.content_expire_date && parseYmd(modified.content_expire_date);
            params.content_expire_date = date ? formatDate(date, userFormat.dateFormat) : ''
        }

        if (Object.keys(params).length > 1 || 'handlerCls' in modified) {
            // always sent: the controller deletes the user's choice without it (empty: the default)
            params.handlerCls = values.handlerCls === DEFAULT_HANDLER ? '' : (values.handlerCls || '');
            await submitFile(params)
        }

        return {id: file.id}
    }
}

export default Neo.setupClass(FilePropertiesDialog);
