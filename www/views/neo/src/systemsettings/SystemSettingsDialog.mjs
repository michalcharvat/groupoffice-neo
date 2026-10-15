import Button         from '../button/Button.mjs';
import Container      from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TabContainer   from '../../node_modules/neo.mjs/src/tab/Container.mjs';
import Toolbar        from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import client         from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import ConfirmDialog  from '../view/ConfirmDialog.mjs';
import Dialog         from '../view/Dialog.mjs';
import {notifyError}  from '../Notify.mjs';
import {t}            from '../Translate.mjs';

/**
 * Core cards: [itemId (route "#systemsettings/<itemId>"), title, Font Awesome icon, panel, may the user see it]
 * @returns {Array[]}
 */
const CORE_CARDS = () => [
    ['general', t('General'), 'fa fa-file-lines', () => import('./GeneralPanel.mjs'), () => client.isAdmin]
];

/**
 * System settings (go.systemsettings.Dialog), for administrators: the header user menu
 * or "#systemsettings/<itemId>". Cards on the left: the core ones, then the cards
 * modules register (ModuleRegistry `systemSettings`, shared with My account):
 *
 *     ModuleRegistry.register({..., systemSettings: {
 *         title  : t('History'),
 *         iconCls: 'fa fa-clock-rotate-left',
 *         panel  : () => import('./view/SystemSettingsPanel.mjs') // default export: a neo container
 *     }})
 *
 * A module's settings card extends GO.systemsettings.SettingsPanel (Module settings form);
 * any card may implement its interface (load, isModified, validate, save, needsReload).
 * Save validates all cards, saves the ones that implement save() and closes; when a card
 * reports needsReload (saved page title, colours, logo; changed modules) all windows reload.
 */
class SystemSettingsDialog extends Dialog {
    static config = {
        className   : 'GO.systemsettings.SystemSettingsDialog',
        cls         : ['go-systemsettings-dialog'],
        title       : t('System settings'),
        modal       : true,
        resizable   : true,
        wrapperStyle: {
            height: '86vh',
            left  : 'max(0px, calc(50vw - 600px))',
            top   : '7vh',
            width : 'min(1200px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Card to show first (itemId)
         * @member {String|null} activeItem=null
         */
        activeItem: null
    }

    /**
     * itemId of each card, in card order
     * @member {String[]} itemIds=[]
     */
    itemIds = []

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module             : TabContainer,
            reference          : 'cards',
            cls                : ['go-settings-cards'],
            flex               : 1,
            tabBarPosition     : 'left',
            removeInactiveCards: false,
            items              : []
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                ntype    : 'component',
                cls      : ['go-form-error'],
                reference: 'error',
                flex     : 1
            }, {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.requestClose()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                disabled : true,
                text     : t('Save'),
                handler  : () => me.submit()
            }]
        }]
    }

    /**
     * @returns {Neo.tab.Container}
     */
    get cards() {
        return this.getReference('cards')
    }

    /**
     * @returns {Neo.component.Base[]} the cards' panels
     */
    get panels() {
        return this.cards.getCardContainer().items.map(card => card.items[0])
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            await me.addCards()
        } catch (e) {
            notifyError(me, e)
        }

        if (me.isDestroyed) {
            return
        }

        me.activeItem && me.showCard(me.activeItem);

        await Promise.all(me.panels.map(panel => panel.load?.()));

        // a card that did not load can't be saved (SettingsPanel.save() refuses it)
        me.isDestroyed || (me.getReference('saveButton').disabled = false)
    }

    /**
     * The core cards the user may see, then the modules' cards
     * @protected
     */
    async addCards() {
        let me = this;

        const core = await Promise.all(CORE_CARDS().filter(card => card[4]()).map(async ([itemId, title, iconCls, load]) =>
                  ({itemId, title, iconCls, panel: (await load()).default})
              )),
              modules = await ModuleRegistry.loadSettingsPanels('systemSettings', m => me.mayManage(m));

        if (me.isDestroyed) {
            return
        }

        [...core, ...modules].forEach(({itemId, title, iconCls, panel}) => {
            me.itemIds.push(itemId);
            const card = me.cards.add({
                module: Container,
                cls   : ['go-settings-card'],
                header: {text: title, iconCls},
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{module: panel, flex: 1}]
            }), cardPanel = card.items[0];

            cardPanel.on({
                loaderror: ({error}) => me.showError(error.message || String(error)),
                // field errors show on the fields, the rest here
                saveerror: ({error}) => me.showError([error.message || String(error), ...cardPanel.unmappedErrors || []].join(' '))
            })
        })
    }

    /**
     * A module's cards: administrators, or users with the module's "mayManage" right
     * @param {Object} module registry entry
     * @returns {Boolean}
     */
    mayManage(module) {
        return client.isAdmin || !!client.session?.capabilities?.[module.capability]?.mayManage
    }

    /**
     * @param {String} itemId
     */
    showCard(itemId) {
        const index = this.itemIds.indexOf(itemId);
        index > -1 && (this.cards.activeIndex = index)
    }

    /**
     * Validates all cards, saves them and closes
     * @returns {Promise<Boolean>}
     */
    async submit() {
        let me     = this,
            button = me.getReference('saveButton'),
            panels = me.panels;

        if (button.disabled) {
            return false
        }

        button.disabled = true;
        me.showError('');

        try {
            for (const [index, panel] of panels.entries()) {
                if (panel.validate && !await panel.validate()) {
                    me.cards.activeIndex = index;
                    me.showError(t('You have errors in your form. The invalid fields are marked.'));
                    return false
                }
            }

            // one HTTP request: the client batches calls of the same tick
            const saving  = panels.filter(panel => panel.save),
                  results = await Promise.all(saving.map(panel => panel.save().catch(e => {
                      notifyError(me, e);
                      return false
                  })));

            if (me.isDestroyed) {
                return false
            }

            const failed = results.indexOf(false);

            if (failed > -1) {
                me.cards.activeIndex = panels.indexOf(saving[failed]);
                return false
            }

            me.fire('save', {});
            me.close();
            return true
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }

    /**
     * Save failures show on their card (form errors) and here
     * @param {String} text
     */
    showError(text) {
        const error = this.getReference('error');
        error && (error.text = text)
    }

    /**
     * Close by the user (Cancel, X, Escape): asks before discarding changes
     */
    async requestClose() {
        let me = this;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        const modified = await Promise.all(me.panels.map(panel => panel.isModified?.() || false));

        if (modified.some(Boolean)) {
            const discard = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                message : t('Are you sure you want to close this window and discard your changes?')
            });

            if (!discard || me.isDestroyed) {
                return
            }
        }

        me.close()
    }

    /**
     * Settings apply on page load (go.systemsettings.Dialog reloads on close): all windows
     * reload when a card changed something that needs it (needsReload)
     */
    close(...args) {
        let me     = this,
            reload = !me.isClosing && !me.isDestroyed && me.panels.some(panel => panel.needsReload);

        super.close(...args);

        reload && Object.keys(Neo.apps || {}).forEach(windowId => Neo.Main.reloadWindow({windowId}))
    }

    closeOrHideAction() {
        this.requestClose()
    }

    onKeyDownEscape() {
        this.requestClose()
    }
}

export default Neo.setupClass(SystemSettingsDialog);
