import Container  from '../../node_modules/neo.mjs/src/container/Base.mjs';
import SharePanel from '../permissions/SharePanel.mjs';
import {LEVEL_READ} from '../Acl.mjs';
import {t}        from '../Translate.mjs';

/**
 * "Visible to" card of My account for user managers (go.usersettings.VisibleToPanel):
 * the groups that see this user, i.e. the ACL of the user's personal group.
 */
class VisibleToPanel extends Container {
    static config = {
        className: 'GO.usersettings.VisibleToPanel',
        baseCls  : ['go-usersettings-visibleto', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : SharePanel,
            reference: 'sharePanel',
            name     : 'personalGroup.acl',
            flex     : 1,
            // ExtJS showLevels: false — visible or not
            levels   : [{value: '', name: ''}, {value: LEVEL_READ, name: t('Visible')}]
        }]
    }

    /**
     * Called by the dialog after loading the user
     * @param {Object} user
     */
    onLoad(user) {
        const id = user.personalGroup?.id;

        id && this.getReference('sharePanel').setEntity('Group', id)
    }
}

export default Neo.setupClass(VisibleToPanel);
