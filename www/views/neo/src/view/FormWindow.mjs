import Button         from '../button/Button.mjs';
import ConfirmDialog  from './ConfirmDialog.mjs';
import Container      from '../../node_modules/neo.mjs/src/container/Base.mjs';
import DataSourceForm from '../form/DataSourceForm.mjs';
import Dialog         from './Dialog.mjs';
import TabContainer   from '../../node_modules/neo.mjs/src/tab/Container.mjs';
import Toolbar        from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {addCustomFieldsTo} from '../customfields/form.mjs';
import {t}            from '../Translate.mjs';

/**
 * Dialog that creates or edits one JMAP entity (GOUI FormWindow).
 *
 *     class NoteDialog extends FormWindow {
 *         static config = {className: 'GO.notes.view.NoteDialog', entityName: 'Note', title: t('Note')}
 *
 *         createFormItems() {               // fields of the "General" tab
 *             return [{module: TextField, name: 'name', labelText: t('Name'), required: true}]
 *         }
 *     }
 *
 *     Neo.create(NoteDialog, {appName, windowId, entityId: 5});            // edit
 *     Neo.create(NoteDialog, {appName, windowId, values: {noteBookId: 3}}); // new
 *
 * Layout: form → cards (tab container, tab bar only with 2+ cards) → generalTab,
 * then a button bar: [link slot] [error text] Cancel Save.
 *
 * Extension points for later core parts:
 * - addCustomFields(): custom field fieldsets (general tab or own cards)
 * - addSharePanel():   permissions card for ACL entities
 * - hasLinks + linkSlot: "create link" button for new / "browse links" for existing entities
 * - addCard(config):   any extra card
 *
 * Events:
 * - formReady {currentId}   loaded, or prepared for a new entity
 * - save  {data, isNew}     saved (the window closes when closeOnSave)
 * - saveerror {error, validationErrors}
 */
class FormWindow extends Dialog {
    static config = {
        className: 'GO.view.FormWindow',
        cls      : ['go-form-window'],
        modal    : true,
        resizable: true,
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {
            height: '600px',
            left  : 'calc(50vw - 230px)',
            maxHeight: '90vh',
            top   : 'max(5vh, calc(50vh - 300px))',
            width : '460px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * JMAP entity, e.g. 'Note'
         * @member {String|null} entityName=null
         */
        entityName: null,
        /**
         * Entity to edit, null to create one
         * @member {String|Number|null} entityId=null
         */
        entityId: null,
        /**
         * Initial values of a new entity (fields and defaults without a field)
         * @member {Object} values={}
         */
        values: {},
        /**
         * Properties to load, null for all
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * @member {Boolean} closeOnSave=true
         */
        closeOnSave: true,
        /**
         * Linkable entity: shows the link button(s) in linkSlot (links, core item 4)
         * @member {Boolean} hasLinks=false
         */
        hasLinks: false,
        /**
         * Tab of the first card (createFormItems()), null: "General"
         * @member {Object|null} generalHeader=null
         */
        generalHeader: null,
        /**
         * Extra config of the cards' tab container, e.g. {tabBarPosition: 'left'}
         * @member {Object} cardsConfig={}
         */
        cardsConfig: {}
    }

    /**
     * Resolves once the form is loaded or prepared (see `ready` event)
     * @member {Promise|null} readyPromise=null
     */
    readyPromise = null

    /**
     * The entity is loaded (or prepared): saving is allowed
     * @member {Boolean} formReady=false
     */
    formReady = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module    : DataSourceForm,
            reference : 'form',
            entity    : me.entityName,
            properties: me.properties,
            flex      : 1,
            layout    : {ntype: 'vbox', align: 'stretch'},
            listeners : {
                loaderror: ({error}) => me.showError(error.message || String(error)),
                saveerror: data      => me.onSaveError(data),
                save     : data      => me.onFormSave(data),
                invalid  : ()        => me.focusFirstInvalid()
            },
            items: [{
                module             : TabContainer,
                reference          : 'cards',
                cls                : ['go-form-cards'],
                flex               : 1,
                removeInactiveCards: false,
                ...me.cardsConfig,
                items              : [{
                    module   : Container,
                    reference: 'generalTab',
                    cls      : ['go-form-card', 'go-form-general'],
                    header   : me.generalHeader || {text: t('General')},
                    layout   : {ntype: 'vbox', align: 'stretch'},
                    items    : me.createFormItems()
                }]
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons', 'go-form-window-buttons'],
            flex  : 'none',
            items : [{
                // link buttons (core item 4) go here
                module   : Container,
                reference: 'linkSlot',
                cls      : ['go-form-link-slot'],
                flex     : 'none',
                hidden   : true,
                layout   : {ntype: 'hbox', align: 'center'},
                items    : []
            }, {
                ntype    : 'component',
                cls      : ['go-form-error'],
                reference: 'error',
                flex     : 1
            }, {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.requestClose()
            }, {
                // GOUI form window: a filled primary submit button
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                // enabled once the entity is loaded (or prepared): an early save
                // would create instead of update
                disabled : true,
                text     : t('Save'),
                handler  : () => me.submit()
            }]
        }]
    }

    /**
     * @returns {GO.form.DataSourceForm}
     */
    get form() {
        return this.getReference('form')
    }

    /**
     * @returns {Neo.tab.Container}
     */
    get cards() {
        return this.getReference('cards')
    }

    /**
     * @returns {Neo.container.Base} the "General" card
     */
    get generalTab() {
        return this.getReference('generalTab')
    }

    /**
     * @returns {Neo.container.Base} container for link buttons, hidden until used
     */
    get linkSlot() {
        return this.getReference('linkSlot')
    }

    /**
     * Fields of the "General" tab. Override in subclasses.
     * @returns {Object[]} item configs
     */
    createFormItems() {
        return []
    }

    /**
     * Custom field fieldsets of entityName, into generalTab or as own cards via
     * addCard() (src/customfields/form.mjs). Called from onConstructed(); the form
     * loads once they exist.
     * @returns {Promise<void>}
     */
    addCustomFields() {
        return addCustomFieldsTo(this)
    }

    /**
     * Extension point (core item 5): a permissions card for ACL entities.
     * Subclasses call it; the share panel adds itself with addCard() and
     * reads form.currentId on `ready`.
     */
    addSharePanel() {
    }

    /**
     * Adds a card; the tab bar shows from two cards on
     * @param {Object} config item config, header: {text}
     * @returns {Neo.component.Base}
     */
    addCard(config) {
        const card = this.cards.add({
            module: Container,
            cls   : ['go-form-card'],
            layout: {ntype: 'vbox', align: 'stretch'},
            ...config
        });

        this.updateCardMenu();
        return card
    }

    /**
     * Tab bar only with more than one card (GOUI cardMenu)
     * @protected
     */
    updateCardMenu() {
        const {cards} = this,
              single  = cards.getCardContainer().items.length < 2;

        cards.getTabBar().hidden   = single;
        cards.getTabStrip().hidden = single
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        const customFieldsPromise = me.addCustomFields();
        me.updateCardMenu();

        me.readyPromise = (async () => {
            await me.timeout(1);
            // a broken custom field set must not keep the form from loading
            await Promise.resolve(customFieldsPromise).catch(e => console.error('Custom fields', e));

            if (me.isDestroyed) {
                return
            }

            if (me.entityId) {
                const entity = await me.form.load(me.entityId);

                // form.load() reported the failure (loaderror)
                if (!entity || me.isDestroyed) {
                    return
                }
            } else {
                await me.form.create(me.values)
            }

            if (!me.isDestroyed) {
                me.formReady = true;
                me.getReference('saveButton').disabled = false;
                me.onReady();
                me.fire('formReady', {currentId: me.form.currentId})
            }
        })();
    }

    /**
     * Form loaded or prepared. Shows the link slot for linkable entities.
     * @protected
     */
    onReady() {
        const me = this;

        me.hasLinks && me.linkSlot.items.length && (me.linkSlot.hidden = false)
    }

    /**
     * Validates and saves the form
     * @returns {Promise<Object|false>}
     */
    async submit() {
        let me     = this,
            button = me.getReference('saveButton');

        if (!me.formReady || button.disabled) {
            return false
        }

        button.disabled = true;
        me.showError('');
        me.isLoading = true;

        try {
            // rich text editors sync their HTML debounced: take the last typing along
            const fields = await me.form.getFields();
            await Promise.all(fields.filter(field => typeof field.flush === 'function').map(field => field.flush()));

            return await me.form.submit()
        } finally {
            if (!me.isDestroyed) {
                me.isLoading    = false;
                button.disabled = false
            }
        }
    }

    /**
     * @param {Object} data {data, isNew}
     * @protected
     */
    onFormSave(data) {
        let me = this;

        me.fire('save', data);
        me.closeOnSave && me.close()
    }

    /**
     * @param {Object} data {error, validationErrors}
     * @protected
     */
    onSaveError({error, validationErrors}) {
        let me       = this,
            unmapped = me.form.unmappedErrors || [];

        me.showError([error.message, ...unmapped].join(' '));
        me.fire('saveerror', {error, validationErrors});
        validationErrors && me.focusFirstInvalid()
    }

    /**
     * Text in the button bar, '' to clear
     * @param {String} text
     */
    showError(text) {
        const error = this.getReference('error');
        error && (error.text = text)
    }

    /**
     * Shows the card of the first invalid field and focuses it
     */
    async focusFirstInvalid() {
        let me    = this,
            field = await me.form.findFirstInvalid();

        if (!field || me.isDestroyed) {
            return
        }

        const cardContainer = me.cards.getCardContainer();
        let cmp = field;

        while (cmp && cmp.parentId !== cardContainer.id) {
            cmp = Neo.getComponent(cmp.parentId)
        }

        const index = cmp ? cardContainer.items.indexOf(cmp) : -1;
        index > -1 && (me.cards.activeIndex = index);

        field.focus?.(field.getInputElId?.() || field.id)
    }

    /**
     * Unsaved changes, asked before closing. Subclasses add state that is no form value.
     * @returns {Promise<Boolean>}
     */
    isModified() {
        return this.form.isModified()
    }

    /**
     * Close by the user (Cancel, X, Escape): asks before discarding changes
     */
    async requestClose() {
        let me = this;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        if (await me.isModified()) {
            const discard = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                message : t('Are you sure you want to close this window and discard your changes?')
            });

            if (me.isDestroyed) {
                return
            }

            if (!discard) {
                return
            }
        }

        me.close()
    }

    closeOrHideAction() {
        this.requestClose()
    }

    onKeyDownEscape() {
        this.requestClose()
    }
}

export default Neo.setupClass(FormWindow);
