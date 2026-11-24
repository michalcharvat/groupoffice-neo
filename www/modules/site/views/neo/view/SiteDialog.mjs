import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox     from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client           from '../../../../../views/neo/src/jmap/Client.mjs';
import SharePanel       from '../../../../../views/neo/src/permissions/SharePanel.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import {saveAcl}        from '../../../../files/views/neo/view/acl.mjs';

const t = translator('legacy', 'site');

/** Fields of the dialog that site/site/submit takes */
const FIELDS = ['name', 'domain', 'base_path', 'language', 'ssl', 'mod_rewrite', 'mod_rewrite_base_path'];

/**
 * Properties of a site (GO.site.SiteDialog, site/site/load|submit) with a Permissions tab for
 * the site's ACL (GO.grid.PermissionsPanel over core/aclGroup).
 *
 *     SiteDialog.open({appName, windowId, id}) // → the dialog, after loading
 */
class SiteDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.site.view.SiteDialog',
        // custom fields of the site (the legacy model has CustomFieldsTrait)
        entityName  : 'Site',
        title       : t('Options'),
        generalHeader: {text: t('Options')},
        wrapperStyle: {height: 'min(640px, 90vh)', left: 'calc(50vw - 260px)', top: 'max(5vh, calc(50vh - 320px))', width: 'min(520px, 100vw)'},
        /**
         * Site id
         * @member {String|Number|null} siteId=null
         */
        siteId: null,
        /**
         * The site's ACL
         * @member {Number|null} aclId=null
         */
        aclId: null
    }

    /**
     * {groupId: level} of the ACL as loaded
     * @member {Object|null} aclValue=null
     */
    aclValue = null

    /**
     * Loads the site, then shows the dialog
     * @param {Object} config appName, windowId, id
     * @returns {Promise<SiteDialog>}
     */
    static async open({id, ...config}) {
        const {data} = await client.legacy('site/site/load', {id}, {method: 'GET'});

        return Neo.create(SiteDialog, {
            ...config,
            siteId: id,
            aclId : +data.acl_id || null,
            values: {
                name                 : data.name || '',
                module               : data.module || '',
                domain               : data.domain || '',
                base_path            : data.base_path || '',
                language             : data.language || '',
                ssl                  : !!+data.ssl,
                mod_rewrite          : !!+data.mod_rewrite,
                mod_rewrite_base_path: data.mod_rewrite_base_path || '',
                customFields         : data.customFields || {}
            }
        })
    }

    createFormItems() {
        const text = (name, label, config={}) => ({
            module       : TextField,
            name,
            labelText    : label,
            labelPosition: 'inline',
            maxLength    : 100,
            ...config
        });

        return [
            text('name', t('Name'), {required: true}),
            text('module', t('Module'), {readOnly: true, clearable: false}),
            text('domain', t('Domain'), {required: true}),
            text('base_path', t('Base path')),
            text('language', t('Language'), {maxLength: 10}),
            {module: BoolCheckBox, name: 'ssl', valueLabel: t('SSL')},
            {module: BoolCheckBox, name: 'mod_rewrite', valueLabel: t('Mod rewrite')},
            text('mod_rewrite_base_path', t('Mod rewrite base path'), {required: true, maxLength: 50})
        ]
    }

    onConstructed() {
        const result = super.onConstructed();
        this.addPermissionsCard();
        return result
    }

    /**
     * "Permissions" tab: the site's ACL, read-only without manage permission
     */
    addPermissionsCard() {
        let me = this;

        if (!me.aclId) {
            return
        }

        me.addCard({
            header: {text: coreT('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1, name: 'aclLevels'}]
        });

        me.on('formReady', async () => {
            const panel = me.getReference('sharePanel');

            if (!panel) {
                return
            }

            try {
                const {results = [], manage_permission} = await client.legacy('core/aclGroup/selectedStore', {model_id: me.aclId, limit: 0}),
                      value = {};

                results.forEach(r => value[r.id] = +r.level);
                me.aclValue    = value;
                panel.readOnly = !manage_permission;
                await panel.setAclId(me.aclId, value);
                me.isDestroyed || me.form.setOriginalValue('aclLevels', panel.getSubmitValue())
            } catch (e) {
                console.error('SharePanel', e)
            }
        })
    }

    async save(modified, values) {
        let me     = this,
            params = {id: me.siteId};

        FIELDS.forEach(key => {
            if (key in modified) {
                params[key] = typeof modified[key] === 'boolean' ? (modified[key] ? 1 : 0) : (modified[key] ?? '')
            }
        });

        // the legacy model takes its custom fields as JSON
        'customFields' in modified && (params.customFieldsJSON = JSON.stringify(values.customFields || {}));

        Object.keys(params).length > 1 && await client.legacy('site/site/submit', params);

        if (modified.aclLevels && me.aclId && me.aclValue) {
            await saveAcl(me.aclId, me.aclValue, values.aclLevels || {})
        }

        return {id: me.siteId}
    }
}

export default Neo.setupClass(SiteDialog);
