import Button from '../button/Button.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import {createLinks} from './links.mjs';
import SelectSearchDialog from './SelectSearchDialog.mjs';

/**
 * Detail toolbar button "Add link" (GOUI links/AddButton): links existing items,
 * picked in a SelectSearchDialog, to the entity set with setEntity().
 *
 * GOUI's menu also lists "new item" entries of modules that define a linkWindow;
 * no neo module does yet, so the button opens the search directly.
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
     * @member {Object|null} target=null {entity, entityId}
     */
    target = null

    construct(config) {
        super.construct(config);
        this.handler = () => this.openDialog()
    }

    /**
     * @param {String|null} entity
     * @param {String|Number|null} entityId
     */
    setEntity(entity, entityId) {
        let me = this;

        me.target   = entity && entityId ? {entity, entityId} : null;
        me.disabled = !me.target
    }

    openDialog() {
        let me     = this,
            target = me.target;

        if (!target) {
            return
        }

        const dialog = Neo.create(SelectSearchDialog, {
            appName : me.appName,
            exclude : target,
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
