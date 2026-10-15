import Button from '../button/Button.mjs';
import client from '../jmap/Client.mjs';
import {t} from '../Translate.mjs';
import LinkBrowser from './LinkBrowser.mjs';
import {countLinks} from './links.mjs';

/**
 * Detail toolbar button (GOUI LinkBrowseButton): link icon with the number of
 * links, opens the LinkBrowser of the entity set with setEntity().
 */
class LinkBrowseButton extends Button {
    static config = {
        className: 'GO.link.LinkBrowseButton',
        icon     : 'link',
        tooltip  : t('Links'),
        disabled : true
    }

    /**
     * @member {Object|null} target=null {entity, entityId}
     */
    target = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.handler = () => me.target && Neo.create(LinkBrowser, {
            appName : me.appName,
            entity  : me.target.entity,
            entityId: me.target.entityId,
            windowId: me.windowId
        });

        client.watch(['Link']);

        me.removeStateListener = client.on('stateChange', ({changed}) => {
            changed.includes('Link') && me.updateCount()
        })
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @param {String|null} entity
     * @param {String|Number|null} entityId
     */
    setEntity(entity, entityId) {
        let me = this;

        me.target   = entity && entityId ? {entity, entityId} : null;
        me.disabled = !me.target;
        me.updateCount()
    }

    async updateCount() {
        let me     = this,
            target = me.target;

        if (!target) {
            me.text = '';
            return
        }

        try {
            const count = await countLinks(target.entity, target.entityId);
            me.isDestroyed || me.target !== target || (me.text = count ? String(count) : '')
        } catch (e) {
            me.isDestroyed || (me.text = '')
        }
    }
}

export default Neo.setupClass(LinkBrowseButton);
