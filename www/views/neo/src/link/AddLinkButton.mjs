import Button from '../button/Button.mjs';
import client from '../jmap/Client.mjs';
import {showComposer} from '../Mail.mjs';
import MenuList from '../menu/List.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import {createLinks} from './links.mjs';
import SelectSearchDialog from './SelectSearchDialog.mjs';

/**
 * Detail toolbar button "Add link" (GOUI links/AddButton, ExtJS detail/AddButton): links
 * existing items, picked in a SelectSearchDialog, to the entity set with setEntity().
 *
 * With the e-mail composer and the savemailas module (its LinkedEmail entity stores the
 * link of a sent e-mail, ExtJS SaveEmailAs.js linkWindow) the button opens a menu:
 * "Existing item" and "E-mail", a new e-mail linked to the entity. A contact's e-mail goes
 * to its first address. Other neo modules don't define "new item" entries yet.
 *
 * Fires `linked` {count} after the links were created.
 */
class AddLinkButton extends Button {
    static config = {
        className: 'GO.link.AddLinkButton',
        icon     : 'add_link',
        tooltip  : t('Add link'),
        disabled : true
    }

    /**
     * @member {Object|null} target=null {entity, entityId, record}
     */
    target = null

    construct(config) {
        super.construct(config);
        this.handler = () => this.onClick()
    }

    /**
     * @param {String|null} entity
     * @param {String|Number|null} entityId
     * @param {Object|null} [record] the entity's data (a contact's e-mail addresses)
     */
    setEntity(entity, entityId, record=null) {
        let me = this;

        me.target   = entity && entityId ? {entity, entityId, record} : null;
        me.disabled = !me.target
    }

    /**
     * @returns {Boolean} a sent e-mail can be linked to the entity
     */
    static mayEmail() {
        return ModuleRegistry.getConfigs('showComposer').length > 0 && client.hasCapability('go:legacy:savemailas')
    }

    onClick() {
        let me = this;

        if (!me.target) {
            return
        }

        if (!AddLinkButton.mayEmail()) {
            me.openDialog();
            return
        }

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.id,
            items   : [
                {text: t('Existing item'), icon: 'search', handler: () => me.openDialog()},
                {separator: true},
                {text: t('E-mail'), icon: 'email', handler: () => me.composeEmail()}
            ]
        })
    }

    /**
     * A new e-mail linked to the entity (ExtJS savemailas linkWindow with the detail's
     * getEmailComposerConfig())
     */
    composeEmail() {
        let me     = this,
            target = me.target,
            first  = target?.record?.emailAddresses?.[0]?.email;

        target && showComposer({
            appName : me.appName,
            windowId: me.windowId,
            links   : [{entity: target.entity, entityId: target.entityId}],
            ...first ? {to: first, name: target.record.name || ''} : {},
            // a contact fills the template's contact tags
            ...target.entity === 'Contact' ? {entity: 'Contact', entityId: target.entityId} : {}
        })
    }

    openDialog() {
        let me     = this,
            target = me.target;

        if (!target) {
            return
        }

        const dialog = Neo.create(SelectSearchDialog, {
            appName : me.appName,
            exclude : {entity: target.entity, entityId: target.entityId},
            windowId: me.windowId
        });

        dialog.on('select', async ({records}) => {
            try {
                await createLinks(target.entity, target.entityId, records);
                me.isDestroyed || me.fire('linked', {count: records.length})
            } catch (e) {
                notifyError(me, e)
            }
        })
    }
}

export default Neo.setupClass(AddLinkButton);
