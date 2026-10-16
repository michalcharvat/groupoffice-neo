import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import JmapComboBox  from '../form/field/JmapComboBox.mjs';
import LocalCombo    from '../form/field/LocalCombo.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import client        from '../jmap/Client.mjs';
import TextList      from '../list/TextList.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import Dialog        from '../view/Dialog.mjs';
import MappingEditor, {FIXED, NOT_MAPPED} from './MappingEditor.mjs';

const normalize = text => String(text ?? '').toLowerCase().replace(/[_\-\s]/g, '');

/**
 * Sets a value at a path like "emailAddresses[].email": "[]" appends an item
 * (go.util.Object.applyPath())
 * @param {Object} target
 * @param {String} path
 * @param {*} value
 * @returns {Object} the object that got the last key
 */
function applyPath(target, path, value) {
    const parts = path.split('.'),
          last  = parts.pop();

    parts.forEach(part => {
        if (part.endsWith('[]')) {
            const list = target[part.slice(0, -2)] ??= [],
                  item = {};

            list.push(item);
            target = item
        } else {
            target = target[part] ??= {}
        }
    });

    target[last] = value;
    return target
}

/**
 * Column mapping of a CSV or Excel import (go.import.CsvMappingDialog): the file's columns
 * against the entity's properties, saved as a "column profile" (ImportMapping) that is
 * found again by the file's headers. CSV files get date / number formats. Import runs
 * Entity/import in the background; its progress comes as notifications.
 *
 *     Neo.create(CsvMappingDialog, {appName, windowId, entity: 'Contact', blobId, fileName,
 *         values: {addressBookId: 3}, fields: {...}, aliases: {...}, lookupFields: {id: 'ID'}})
 */
class CsvMappingDialog extends Dialog {
    static config = {
        className   : 'GO.import.CsvMappingDialog',
        cls         : ['go-import-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Import Comma Separated values'),
        wrapperStyle: {height: '86vh', left: 'max(0px, calc(50vw - 400px))', top: '7vh', width: 'min(800px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Uploaded file
         * @member {String|null} blobId=null
         */
        blobId: null,
        /**
         * @member {String} fileName=''
         */
        fileName: '',
        /**
         * Values of every imported item (e.g. {addressBookId}); these properties are not mapped
         * @member {Object} values={}
         */
        values: {},
        /**
         * Labels: {prop: {label, properties: {sub: {label}}}}
         * @member {Object} fields={}
         */
        fields: {},
        /**
         * Labels without sub properties: {prop: 'Label'} (go.util.importFile options.labels)
         * @member {Object} labels={}
         */
        labels: {},
        /**
         * CSV header → property, or {field: 'list[].prop', fixed: {}, related: {}} (auto mapping)
         * @member {Object} aliases={}
         */
        aliases: {},
        /**
         * Properties that may identify existing items: {prop: 'Label'}
         * @member {Object} lookupFields={id: 'ID'}
         */
        lookupFields: {id: 'ID'}
    }

    construct(config) {
        super.construct(config);

        let me    = this,
            isCsv = /\.csv$/i.test(me.fileName || '');

        me.items = [{
            ntype : 'container',
            cls   : ['go-import-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'component',
                tag  : 'p',
                cls  : ['go-import-intro'],
                flex : 'none',
                text : t("Please match the CSV columns with the correct Group-Office columns and press 'Import' to continue.") + ' ' +
                       t('The column profile will be saved with the name provided field below.')
            }, {
                module: Container,
                cls   : ['go-import-profile'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module       : JmapComboBox,
                    reference    : 'profile',
                    entity       : 'ImportMapping',
                    jmapFilter   : {entity: me.entity},
                    properties   : ['id', 'name'],
                    labelText    : t('Column profile'),
                    labelPosition: 'inline',
                    flex         : 1,
                    // user picks only (neo fires select from the list, {value: record})
                    listeners    : {select: ({value}) => value?.id && me.loadProfile(value.id)}
                }, {
                    module   : Button,
                    reference: 'deleteProfile',
                    icon     : 'delete',
                    tooltip  : t('Delete'),
                    disabled : true,
                    handler  : () => me.deleteProfile()
                }]
            }, {
                module       : TextField,
                reference    : 'saveName',
                labelText    : t('Name'),
                labelPosition: 'inline',
                subLabelText : t('Enter a name to save the column mapping'),
                flex         : 'none'
            }, {
                module       : LocalCombo,
                reference    : 'updateBy',
                labelText    : t('Update existing items by'),
                labelPosition: 'inline',
                flex         : 'none',
                width        : null,
                displayField : 'name',
                valueField   : 'id',
                editable     : false,
                listConfig   : {module: TextList},
                store        : {keyProperty: 'id', data: [
                    {id: 'none', name: t("Don't update")},
                    ...Object.entries(me.lookupFields || {}).map(([id, name]) => ({id, name}))
                ]},
                value        : 'none'
            }, ...isCsv ? [fieldset(t('Formatting'), [{
                module: Container,
                cls   : ['go-import-formats'],
                flex  : 'none',
                layout: 'base',
                items : [
                    ['dateFormat', t('Date format')],
                    ['timeFormat', t('Time format')],
                    ['decimalSeparator', t('Decimal Separator')],
                    ['thousandsSeparator', t('Thousand Separator')]
                ].map(([name, labelText]) => ({module: TextField, reference: name, labelText, labelPosition: 'inline'}))
            }])] : [], fieldset(t('Field mapping'), [{
                module   : MappingEditor,
                reference: 'mapping',
                flex     : 'none'
            }])]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                ntype    : 'component',
                cls      : ['go-form-error'],
                reference: 'status',
                flex     : 1
            }, {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'importButton',
                text     : t('Import'),
                disabled : true,
                handler  : () => me.doImport()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        me.setStatus(t('Loading...'));

        try {
            const [response, user] = await Promise.all([
                client.call(me.entity + '/importCSVMapping', {blobId: me.blobId}),
                client.user?.id ? client.get('User', [client.user.id], ['dateFormat', 'timeFormat', 'decimalSeparator', 'thousandsSeparator']).then(l => l[0] || {}) : {}
            ]);

            if (me.isDestroyed) {
                return
            }

            me.csvHeaders = response.csvHeaders || [];
            me.goHeaders  = response.goHeaders || {};
            me.userFormat = user;

            let mapping;

            if (response.columnMapping) {
                mapping = response.columnMapping;
                me.setProfile(response.id, me.fileName)
            } else {
                mapping = me.mergeAliases(me.headersToMapping(me.goHeaders));
                me.getReference('saveName').value = me.fileName
            }

            me.applyFormats(response);
            me.getReference('mapping').setData({
                goHeaders : me.goHeaders,
                csvHeaders: me.csvHeaders,
                fields    : me.labelFields(),
                skip      : Object.keys(me.values || {}).filter(k => me.values[k] !== null && me.values[k] !== undefined && me.values[k] !== ''),
                mapping
            });

            me.setStatus('');
            me.getReference('importButton').disabled = false
        } catch (e) {
            me.setStatus('');
            notifyError(me, e)
        }
    }

    setStatus(text) {
        const status = this.getReference('status');
        status && (status.text = text)
    }

    /**
     * fields with the plain labels merged in
     * @returns {Object}
     */
    labelFields() {
        const fields = structuredClone(this.fields || {});

        Object.entries(this.labels || {}).forEach(([name, label]) => (fields[name] ??= {}).label ??= label);

        return fields
    }

    /**
     * The chosen profile: its id in the combo, its name to save under
     * @param {String|null} id
     * @param {String} [fallbackName]
     */
    async setProfile(id, fallbackName) {
        let me    = this,
            combo = me.getReference('profile');

        combo.value = id || null;
        me.getReference('deleteProfile').disabled = !id;

        if (id) {
            const [profile] = await client.get('ImportMapping', [id], ['id', 'name']);
            me.isDestroyed || (me.getReference('saveName').value = profile?.name || fallbackName || '')
        }
    }

    /**
     * A profile picked in the combo: its mapping and formats
     * @param {String} id
     */
    async loadProfile(id) {
        let me = this;

        try {
            const response = await client.call(me.entity + '/importCSVMapping', {id});

            if (me.isDestroyed) {
                return
            }

            me.applyFormats(response);
            me.getReference('mapping').setData({
                goHeaders : me.goHeaders,
                csvHeaders: me.csvHeaders,
                fields    : me.labelFields(),
                skip      : me.getReference('mapping').skip,
                mapping   : response.columnMapping || {}
            });
            me.setProfile(id)
        } catch (e) {
            notifyError(me, e)
        }
    }

    async deleteProfile() {
        let me = this,
            id = me.getReference('profile').getSubmitValue();

        if (!id) {
            return
        }

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: me.getReference('saveName').value || id})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('ImportMapping', {destroy: [id]});
            me.setProfile(null)
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * updateBy and the formats of a profile, the user's formats for the rest
     * @param {Object} response
     */
    applyFormats(response) {
        let me     = this,
            format = me.userFormat || {};

        me.getReference('updateBy').value = response.updateBy || 'none';

        ['dateFormat', 'timeFormat', 'decimalSeparator', 'thousandsSeparator'].forEach(name => {
            const field = me.getReference(name);
            field && (field.value = response[name] ?? format[name] ?? '')
        })
    }

    /**
     * A mapping guessed from the column names (transformCsvHeadersToValues())
     * @param {Object} goHeaders
     * @param {String} [parent] path prefix, e.g. 'emailAddresses[1]'
     * @returns {Object}
     */
    headersToMapping(goHeaders, parent) {
        let me = this,
            v  = {};

        Object.values(goHeaders || {}).forEach(h => {
            const props = h.properties && typeof h.properties === 'object' ? h.properties : null;

            if (h.grouped || (props && Object.keys(props).length)) {
                if (h.many) {
                    v[h.name] = [];

                    for (let index = 1; index < 10; index++) {
                        let part = h.name + '[' + index + ']';
                        part = parent ? parent + '.' + part : part;

                        if (!me.csvHeaders.some(c => c && c.toLowerCase().startsWith(part.toLowerCase()))) {
                            break
                        }

                        v[h.name].push(me.headersToMapping(props, part))
                    }
                } else {
                    v[h.name] = me.headersToMapping(props, h.name)
                }
            } else {
                const target = normalize(parent ? parent + '.' + h.name : h.name),
                      index  = me.csvHeaders.findIndex(c => c && (normalize(c) === target || 'customfields.' + normalize(c) === target));

                v[h.name] = {csvIndex: index > -1 ? index : NOT_MAPPED, fixed: null}
            }
        });

        return v
    }

    /**
     * Mappings of known column names (aliases, and the module's labels) over the guessed ones
     * (findAliases())
     * @param {Object} mapping
     * @returns {Object}
     */
    mergeAliases(mapping) {
        let me      = this,
            aliases = {...me.aliases || {}},
            find    = name => me.csvHeaders.findIndex(c => c && name && c.toLowerCase() === String(name).toLowerCase());

        // a column named like a property's label maps to it (fieldLabelsToAliases())
        Object.entries(me.labelFields()).forEach(([prop, field]) => field.label && !aliases[field.label] && (aliases[field.label] = prop));

        Object.entries(aliases).forEach(([header, config]) => {
            const index = find(header);

            if (index === -1) {
                return
            }

            if (typeof config === 'string') {
                applyPath(mapping, config, {csvIndex: index, fixed: null});
                return
            }

            const child = applyPath(mapping, config.field, {csvIndex: index, fixed: null});

            Object.entries(config.fixed || {}).forEach(([field, value]) => child[field] = {csvIndex: FIXED, fixed: value});
            Object.entries(config.related || {}).forEach(([field, related]) => {
                const relatedIndex = find(related);
                relatedIndex > -1 && (child[field] = {csvIndex: relatedIndex, fixed: null})
            })
        });

        return mapping
    }

    async doImport() {
        let me     = this,
            button = me.getReference('importButton'),
            value  = name => me.getReference(name)?.value ?? null;

        button.disabled = true;
        me.setStatus(t('Importing...'));

        try {
            const updateBy = me.getReference('updateBy').getSubmitValue();

            await client.call(me.entity + '/import', {
                blobId            : me.blobId,
                values            : me.values,
                mappingId         : me.getReference('profile').getSubmitValue() || null,
                mapping           : me.getReference('mapping').getMapping(),
                saveName          : value('saveName') || me.fileName,
                updateBy          : updateBy && updateBy !== 'none' ? updateBy : null,
                decimalSeparator  : value('decimalSeparator'),
                thousandsSeparator: value('thousandsSeparator'),
                dateFormat        : value('dateFormat'),
                timeFormat        : value('timeFormat')
            });

            notify(me, t('Importing is in progress in the background. You will be kept informed about progress via notifications.'), {title: t('Success')});
            me.fire('import', {});
            me.close()
        } catch (e) {
            me.setStatus('');
            notifyError(me, e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(CsvMappingDialog);
