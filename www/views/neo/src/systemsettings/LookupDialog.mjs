import {LEVEL_MANAGE} from '../Acl.mjs';
import SharePanel     from '../permissions/SharePanel.mjs';
import FormWindow     from '../view/FormWindow.mjs';
import {t}            from '../Translate.mjs';

/**
 * @summary Creates or edits one lookup record of a LookupListPanel (status, type, category, unit, ...).
 * The form items come from the lookup's definition (`fields`); `share` adds the Permissions tab of an
 * ACL entity. Lookups have no custom fields. A lookup with more logic subclasses it (crew RankDialog).
 *
 *     Neo.create(LookupDialog, {appName, windowId, entityName: 'AmdCrewCurrency', title: t('Currency'),
 *         fields: () => [{module: TextField, name: 'name', labelText: t('Name'), required: true}], entityId: 5});
 */
class LookupDialog extends FormWindow {
    static config = {
        className   : 'GO.systemsettings.LookupDialog',
        cls         : ['go-form-window', 'go-lookup-dialog'],
        wrapperStyle: {height: '70vh', left: 'max(0px, calc(50vw - 300px))', top: '15vh', width: 'min(600px, 100vw)'},
        /**
         * Returns the form items of the General tab
         * @member {Function|null} fields=null
         */
        fields: null,
        /**
         * The entity owns an ACL: Permissions tab (SharePanel)
         * @member {Boolean} share=false
         */
        share: false
    }

    /**
     * @summary The lookup's fields.
     * @returns {Object[]}
     */
    createFormItems() {
        return this.fields ? this.fields() : []
    }

    /**
     * @summary Lookups have no CustomFieldsTrait: no custom field sets.
     */
    addCustomFields() {
    }

    /**
     * @summary Adds the Permissions tab once the cards exist (share only).
     * @returns {*}
     */
    onConstructed() {
        const result = super.onConstructed();
        this.share && this.addSharePanel();
        return result
    }

    /**
     * @summary Permissions tab: the ACL of the record, the default ACL for a new one.
     */
    addSharePanel() {
        const me = this;

        me.addCard({
            header: {text: t('Permissions')},
            // read-only until the record and its ACL have loaded
            items : [{module: SharePanel, reference: 'sharePanel', readOnly: true, flex: 1}]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            if (!panel) {
                return
            }

            await panel.setEntity(me.entityName, currentId || null).catch(e => console.error('SharePanel', e));

            if (me.isDestroyed) {
                return
            }

            // a new record's default ACL arrives after the form took its unmodified state
            !currentId && me.form.setOriginalValue('acl', panel.getSubmitValue());

            // changing the ACL needs manage on the record (classic SharePanel); a new one is the creator's
            panel.readOnly = !!currentId && (me.form.entityData?.permissionLevel || 0) < LEVEL_MANAGE
        })
    }
}

export default Neo.setupClass(LookupDialog);
