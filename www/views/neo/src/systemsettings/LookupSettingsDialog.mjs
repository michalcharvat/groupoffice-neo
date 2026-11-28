import Container       from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TabContainer    from '../../node_modules/neo.mjs/src/tab/Container.mjs';
import Toolbar         from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button          from '../button/Button.mjs';
import Dialog          from '../view/Dialog.mjs';
import {t}             from '../Translate.mjs';
import LookupListPanel from './LookupListPanel.mjs';

/**
 * @summary A module Settings dialog with several lookup lists (the classic amd SettingsDialog with
 * SettingsGridTrait grids): one tab per lookup definition in a left tab bar (as System settings),
 * each a LookupListPanel. The lookup dialogs save right away, so the dialog has only Close. A
 * change in one list reloads the others (they may show names from it).
 *
 * A lookup definition is the config of its LookupListPanel plus:
 * - itemId, tab: tab id and title
 * - panel: a LookupListPanel subclass to use instead (it carries its own config)
 *
 *     Neo.create(LookupSettingsDialog, {appName, windowId, title: t('Settings'), lookups: [{
 *         itemId: 'currency', tab: t('Currency'), entity: 'AmdCrewCurrency', dialogTitle: t('Currency'),
 *         properties: ['id', 'name', 'permissionLevel'], columns: [...], fields: () => [...]
 *     }]});
 */
class LookupSettingsDialog extends Dialog {
    static config = {
        className   : 'GO.systemsettings.LookupSettingsDialog',
        cls         : ['go-lookup-settings-dialog'],
        title       : t('Settings'),
        modal       : true,
        resizable   : true,
        wrapperStyle: {
            height: '86vh',
            left  : 'max(0px, calc(50vw - 500px))',
            top   : '7vh',
            width : 'min(1000px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * The lookup definitions, in tab order (see above)
         * @member {Object[]} lookups=[]
         */
        lookups: []
    }

    /**
     * @summary The tabs and the Close button.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.items = [{
            module             : TabContainer,
            reference          : 'cards',
            cls                : ['go-settings-cards'],
            flex               : 1,
            tabBarPosition     : 'left',
            removeInactiveCards: false,
            items              : me.lookups.map(({itemId, tab, panel, ...lookup}) => ({
                module: Container,
                cls   : ['go-settings-card'],
                header: {text: tab},
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{module: panel || LookupListPanel, reference: 'lookup-' + itemId, flex: 1, ...lookup}]
            }))
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Close'),
                handler: () => me.requestClose()
            }]
        }]
    }

    /**
     * @summary The lookup panels, in tab order.
     * @returns {GO.systemsettings.LookupListPanel[]}
     */
    get panels() {
        return this.getReference('cards').getCardContainer().items.map(card => card.items[0])
    }

    /**
     * @summary Loads every list once the tabs exist.
     */
    onConstructed() {
        super.onConstructed();

        const panels = this.panels;

        panels.forEach(panel => {
            panel.on('change', () => panels.forEach(other => other !== panel && !other.isDestroyed && other.load()));
            panel.load()
        })
    }
}

export default Neo.setupClass(LookupSettingsDialog);
