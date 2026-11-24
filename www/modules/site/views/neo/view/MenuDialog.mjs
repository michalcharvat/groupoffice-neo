import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import client           from '../../../../../views/neo/src/jmap/Client.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {translator}     from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'site');

/**
 * A menu of a site (GO.site.MenuDialog, site/menu/load|create|update): label and slug.
 *
 *     MenuDialog.open({appName, windowId, siteId, id}) // id null: a new menu
 */
class MenuDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.site.view.MenuDialog',
        title        : t('Menu'),
        generalHeader: {text: t('Menu')},
        wrapperStyle : {height: 'auto', left: 'calc(50vw - 220px)', top: '15vh', width: 'min(440px, 100vw)'},
        /**
         * @member {String|Number|null} siteId=null
         */
        siteId: null,
        /**
         * Menu id, null for a new menu
         * @member {String|Number|null} menuId=null
         */
        menuId: null
    }

    /**
     * Loads the menu (when editing), then shows the dialog
     * @param {Object} config appName, windowId, siteId, id
     * @returns {Promise<MenuDialog>}
     */
    static async open({id=null, siteId, ...config}) {
        let values = {label: '', menu_slug: ''};

        if (id) {
            const {data} = await client.legacy('site/menu/load', {id, site_id: siteId}, {method: 'GET'});
            values = {label: data.label || '', menu_slug: data.menu_slug || ''}
        }

        return Neo.create(MenuDialog, {...config, siteId, menuId: id, values})
    }

    createFormItems() {
        return ['label', 'menu_slug'].map(name => ({
            module       : TextField,
            name,
            labelText    : name === 'label' ? t('Label') : t('Slug'),
            labelPosition: 'inline',
            required     : true,
            maxLength    : 255
        }))
    }

    addCustomFields() {
        // a legacy record without custom fields
    }

    async save(modified, values) {
        let me     = this,
            params = {site_id: me.siteId, label: values.label ?? '', menu_slug: values.menu_slug ?? ''};

        if (me.menuId) {
            params.id = me.menuId;
            Object.keys(modified).length && await client.legacy('site/menu/update', params);
            return {id: me.menuId}
        }

        const {data} = await client.legacy('site/menu/create', params);
        return {id: data?.id}
    }
}

export default Neo.setupClass(MenuDialog);
