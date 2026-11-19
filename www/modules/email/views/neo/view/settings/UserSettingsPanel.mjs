import Container from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import {t}       from '../../util.mjs';

/**
 * E-mail card of My account (ExtJS GO.email.SettingsPanel, Settings.js).
 *
 * STUB of card 1: card 5 (settings) replaces this file and keeps the class name.
 */
class UserSettingsPanel extends Container {
    static config = {
        className: 'GO.email.settings.UserSettingsPanel',
        baseCls  : ['go-email-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            ntype: 'component',
            cls  : ['go-email-stub'],
            text : t('These settings are not available yet')
        }]
    }
}

export default Neo.setupClass(UserSettingsPanel);
