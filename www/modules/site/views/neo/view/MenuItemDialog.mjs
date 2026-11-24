import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox     from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import SelectField      from '../../../../../views/neo/src/form/field/SelectField.mjs';
import client           from '../../../../../views/neo/src/jmap/Client.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {decodeEntities} from '../../../../../views/neo/src/Format.mjs';
import {translator}     from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'site');

/** GO.site.linkTargetStore */
const TARGETS = [
    {value: null,      text: ''},
    {value: '_blank',  text: '_BLANK'},
    {value: '_self',   text: '_SELF'},
    {value: '_parent', text: '_PARENT'},
    {value: '_top',    text: '_TOP'}
];

/** Fields of the dialog that site/menuItem/create|update take */
const FIELDS = ['label', 'url', 'display_children', 'parent_id', 'content_id', 'target'];

/**
 * A menu item (GO.site.MenuitemDialog, site/menuItem/load|create|update): label, URL,
 * display children, parent item (site/menuItem/parentStore), content (site/menu/contentStore)
 * and link target.
 *
 *     MenuItemDialog.open({appName, windowId, menuId, id, parentId}) // id null: a new item
 */
class MenuItemDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.site.view.MenuItemDialog',
        title        : t('Menu item'),
        generalHeader: {text: t('Menu item')},
        wrapperStyle : {height: 'auto', left: 'calc(50vw - 240px)', top: '10vh', width: 'min(480px, 100vw)'},
        /**
         * @member {String|Number|null} menuId=null
         */
        menuId: null,
        /**
         * Menu item id, null for a new item
         * @member {String|Number|null} itemId=null
         */
        itemId: null,
        /**
         * Possible parents and contents: [{value, text}]
         * @member {Object} options={parents: [], contents: []}
         */
        options: {parents: [], contents: []}
    }

    /**
     * Loads the item (when editing) and the options, then shows the dialog
     * @param {Object} config appName, windowId, menuId, id, parentId (a new item's parent)
     * @returns {Promise<MenuItemDialog>}
     */
    static async open({id=null, menuId, parentId=null, ...config}) {
        const [item, parents, contents] = await Promise.all([
            id ? client.legacy('site/menuItem/load', {id, menu_id: menuId}, {method: 'GET'}) : null,
            client.legacy('site/menuItem/parentStore', {id: id || 0, menu_id: menuId, limit: 0}),
            client.legacy('site/menu/contentStore', {menu_id: menuId, limit: 0})
        ]);

        const data  = item?.data || {},
              empty = {value: null, text: ''},
              list  = (results, field) => (results || []).map(r => ({value: String(r.id), text: decodeEntities(String(r[field] ?? ''))}));

        return Neo.create(MenuItemDialog, {
            ...config,
            menuId,
            itemId : id,
            options: {
                parents : [empty, ...list(parents.results, 'label')],
                contents: [empty, ...list(contents.results, 'title')]
            },
            values: {
                label           : data.label || '',
                url             : data.url || '',
                display_children: !!+data.display_children,
                parent_id       : (id ? data.parent_id : parentId) ? String(id ? data.parent_id : parentId) : null,
                content_id      : data.content_id ? String(data.content_id) : null,
                target          : data.target || null
            }
        })
    }

    createFormItems() {
        let me = this;

        return [{
            module       : TextField,
            name         : 'label',
            labelText    : t('Label'),
            labelPosition: 'inline',
            required     : true,
            maxLength    : 255
        }, {
            module       : TextField,
            name         : 'url',
            labelText    : t('Url'),
            labelPosition: 'inline',
            maxLength    : 255
        }, {
            module    : BoolCheckBox,
            name      : 'display_children',
            valueLabel: t('Display children')
        }, {
            module       : SelectField,
            name         : 'parent_id',
            labelText    : t('Parent'),
            labelPosition: 'inline',
            options      : me.options.parents
        }, {
            module       : SelectField,
            name         : 'content_id',
            labelText    : t('Content'),
            labelPosition: 'inline',
            options      : me.options.contents
        }, {
            module       : SelectField,
            name         : 'target',
            labelText    : t('Target'),
            labelPosition: 'inline',
            options      : TARGETS
        }]
    }

    addCustomFields() {
        // a legacy record without custom fields
    }

    async save(modified, values) {
        let me     = this,
            params = {menu_id: me.menuId};

        // a new item posts all fields, an existing one what changed
        FIELDS.forEach(key => {
            if (!me.itemId || key in modified) {
                const value = values[key];
                params[key] = typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? '')
            }
        });

        if (me.itemId) {
            params.id = me.itemId;
            Object.keys(params).length > 2 && await client.legacy('site/menuItem/update', params);
            return {id: me.itemId}
        }

        const {data} = await client.legacy('site/menuItem/create', params);
        return {id: data?.id}
    }
}

export default Neo.setupClass(MenuItemDialog);
