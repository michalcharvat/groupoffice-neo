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
 * With new item types the button opens a menu: "Existing item", then a new item linked
 * to the entity (ExtJS detail/AddButton with the modules' `linkWindow`s):
 * - "E-mail", with the e-mail composer and the savemailas module (its LinkedEmail entity
 *   stores the link of a sent e-mail, ExtJS SaveEmailAs.js linkWindow). A contact's
 *   e-mail goes to its first address.
 * - the `linkWindows` modules register in ModuleRegistry (note, task, contact, event…):
 *   their open() shows the module's dialog and links the new item on save.
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

    /**
     * New item types of the modules the user has access to (ModuleRegistry `linkWindows`)
     * @returns {Object[]} {title, icon, open}, sorted by title
     */
    static getLinkWindows() {
        return ModuleRegistry.getConfigs('linkWindows').flat()
            .filter(l => typeof l.open === 'function')
            .sort((a, b) => String(a.title).localeCompare(String(b.title)))
    }

    onClick() {
        let me = this;

        if (!me.target) {
            return
        }

        const items = [
            ...AddLinkButton.mayEmail() ? [{text: t('E-mail'), icon: 'email', handler: () => me.composeEmail()}] : [],
            ...AddLinkButton.getLinkWindows().map(l => ({text: l.title, icon: l.icon || 'add', handler: () => me.openLinkWindow(l)}))
        ];

        if (!items.length) {
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
                ...items
            ]
        })
    }

    /**
     * A new item of a module, linked to the entity once it is saved
     * @param {Object} linkWindow ModuleRegistry `linkWindows` entry
     */
    async openLinkWindow(linkWindow) {
        let me     = this,
            target = me.target;

        if (!target) {
            return
        }

        try {
            // the item's data: its name becomes the title, a contact's address book is used…
            const record = target.record || (await client.get(target.entity, [target.entityId]).catch(() => []))[0] || null;

            await linkWindow.open({
                appName : me.appName,
                windowId: me.windowId,
                entity  : target.entity,
                entityId: String(target.entityId),
                record
            })
        } catch (e) {
            notifyError(me, e)
        }
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
