import Button         from '../button/Button.mjs';
import ConfirmDialog  from './ConfirmDialog.mjs';
import CreateLinkButton from '../link/CreateLinkButton.mjs';
import LinkBrowseButton from '../link/LinkBrowseButton.mjs';
import Container      from '../../node_modules/neo.mjs/src/container/Base.mjs';
import DataSourceForm from '../form/DataSourceForm.mjs';
import Dialog         from './Dialog.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import TabContainer   from '../../node_modules/neo.mjs/src/tab/Container.mjs';
import Toolbar        from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {addCustomFieldsTo} from '../customfields/form.mjs';
import {createFormExtensions} from '../form/formExtensions.mjs';
import {notifyError}  from '../Notify.mjs';
import {submitOnEnter} from '../form/submitOnEnter.mjs';
import {createLinks}  from '../link/links.mjs';
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
 * - hasLinks: CreateLinkButton for new entities (links created after the first
 *   save), LinkBrowseButton for existing ones; both live in linkSlot.
 *   addLinkOnSave() links a new entity to the item it is created from.
 * - addCard(config):   any extra card
 * - other modules: ModuleRegistry `onFormWindow` (src/form/formExtensions.mjs)
 *
 * Events:
 * - formReady {currentId}   loaded, or prepared for a new entity
 * - save  {data, isNew, created}  saved (the window closes when closeOnSave)
 * - saveerror {error, validationErrors}
 */
class FormWindow extends Dialog {
    static config = {
        className: 'GO.view.FormWindow',
        cls      : ['go-form-window'],
        // Enter in a field saves (ExtJS go.form.Dialog: hidden submit button), Escape as in Dialog
        keys     : {Enter: submitOnEnter('submit'), Escape: 'onEscape'},
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
         * Linkable entity: "create links" for a new, "browse links" for an existing entity
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

    /**
     * Link creation of the last save (onFormSave()), awaited by submit()
     * @member {Promise|null} afterSavePromise=null
     */
    afterSavePromise = null

    /**
     * addLinkOnSave() targets without a create link button
     * @member {Object[]} pendingLinkTargets=[]
     */
    pendingLinkTargets = []

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
                module   : Container,
                reference: 'linkSlot',
                cls      : ['go-form-link-slot'],
                flex     : 'none',
                hidden   : true,
                layout   : {ntype: 'hbox', align: 'center'},
                items    : me.hasLinks ? [{
                    module   : CreateLinkButton,
                    reference: 'createLinkButton',
                    hidden   : true,
                    listeners: {
                        openChange: ({open}) => me.onCreateLinkOpen(open)
                    }
                }, {
                    module   : LinkBrowseButton,
                    reference: 'browseLinksButton',
                    hidden   : true
                }] : []
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
     * @returns {GO.link.CreateLinkButton|null} pending links of a new entity (hasLinks)
     */
    get createLinkButton() {
        return this.getReference('createLinkButton') || null
    }

    /**
     * Links the new entity to an item once it is saved (GOUI addLinkOnSave()),
     * e.g. a task created from a contact. Shown in the create link button.
     * Without hasLinks the link is created on save all the same.
     * @param {String} entity
     * @param {String|Number} entityId
     */
    addLinkOnSave(entity, entityId) {
        let me = this;

        if (me.createLinkButton) {
            me.createLinkButton.addLink(entity, entityId)
        } else {
            me.pendingLinkTargets.push({entity, entityId: String(entityId)})
        }

        me.fire('addlink', {entity, entityId})
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
     * @summary Turns a card's tab off or on (e.g. off until the entity is saved). The first available card
     * takes over when the card was the active one.
     * @param {Neo.component.Base|String} card the card addCard() returned, or its reference
     * @param {Boolean} disabled
     */
    setCardDisabled(card, disabled) {
        this.updateCardTab(card, tab => tab.disabled = disabled, disabled)
    }

    /**
     * @summary Hides or shows a card's tab. The first available card takes over when the card was the active one.
     * @param {Neo.component.Base|String} card the card addCard() returned, or its reference
     * @param {Boolean} hidden
     */
    setCardHidden(card, hidden) {
        this.updateCardTab(card, tab => tab.hidden = hidden, hidden)
    }

    /**
     * @summary Applies fn to the tab of a card.
     * @param {Neo.component.Base|String} card
     * @param {Function} fn (tab) => void
     * @param {Boolean} leave activate the first card when this one is active
     * @protected
     */
    updateCardTab(card, fn, leave) {
        const {cards} = this,
              cmp     = typeof card === 'string' ? this.getReference(card) : card,
              index   = cmp ? cards.getCardContainer().items.indexOf(cmp) : -1,
              tab     = index > -1 ? cards.getTabAtIndex(index) : null;

        if (tab) {
            fn(tab);
            if (leave && cards.activeIndex === index) {
                const items = cards.getCardContainer().items,
                      next  = items.findIndex((item, i) => {
                          const t = cards.getTabAtIndex(i);
                          return i !== index && t && !t.hidden && !t.disabled
                      });

                next > -1 && (cards.activeIndex = next)
            }
        }
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

        me.form.extensions = createFormExtensions(ModuleRegistry.getConfigs('onFormWindow'), me);

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
     * Form loaded or prepared. Shows the link buttons of linkable entities.
     * @protected
     */
    onReady() {
        this.updateLinkButtons()
    }

    /**
     * New entity: create links, saved one: browse its links
     * @protected
     */
    updateLinkButtons() {
        let me = this;

        if (!me.hasLinks) {
            return
        }

        const id     = me.form.currentId,
              create = me.createLinkButton,
              browse = me.getReference('browseLinksButton');

        // failed links of a saved entity stay until they are created
        create.hidden = !!id && !create.links.length;
        browse.hidden = !id;
        id && browse.setEntity(me.entityName, id);
        me.linkSlot.hidden = false
    }

    /**
     * Like GOUI's OverlayToolbarButton: the open link field takes the whole button bar
     * @param {Boolean} open
     * @protected
     */
    onCreateLinkOpen(open) {
        let me = this;

        // neo's flex layout reads `flex` once, when it adds the item
        me.linkSlot.style = {...me.linkSlot.style, flex: open ? '1 1 0%' : '0 0 auto'};
        me.linkSlot.parent.toggleCls('go-create-link-active', open)
    }

    /**
     * Creates the links collected for a new entity
     * @param {String|Number} id of the saved entity
     * @returns {Promise<Boolean>} false when a link failed (the error is shown)
     * @protected
     */
    async createPendingLinks(id) {
        let me      = this,
            targets = me.pendingLinkTargets || [];

        try {
            await me.createLinkButton?.createLinksFor(me.entityName, id);

            if (targets.length) {
                await createLinks(me.entityName, id, targets).catch(e => {
                    // keep the targets that failed for another save
                    const done = new Set((e.created || []).map(to => to.entity + ':' + to.entityId));
                    me.pendingLinkTargets = targets.filter(to => !done.has(to.entity + ':' + to.entityId));
                    throw e
                });
                me.pendingLinkTargets = []
            }

            return true
        } catch (e) {
            if (!me.isDestroyed) {
                notifyError(me, e);
                me.showError(e.message || String(e))
            }

            return false
        }
    }

    /**
     * Links still to create: kept when a link failed, created by the next save
     * @returns {Boolean}
     * @protected
     */
    hasPendingLinks() {
        return !!(this.createLinkButton?.links.length || this.pendingLinkTargets?.length)
    }

    /**
     * Waits for the fields that finish their value late: rich text editors sync their HTML
     * debounced, file fields upload (a failed upload leaves its field invalid)
     * @returns {Promise<void>}
     * @protected
     */
    async flushFields() {
        const fields = await this.form.getFields();
        await Promise.all(fields.filter(field => typeof field.flush === 'function').map(field => field.flush()))
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
            await me.flushFields();

            me.afterSavePromise = null;

            const result = await me.form.submit();
            // links of a new entity (onFormSave())
            await me.afterSavePromise;
            return result
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
        // submit() waits for it: no second save while the links are created
        return this.afterSavePromise = this.afterSave(data)
    }

    /**
     * Saved: creates the collected links, fires `save`, closes. A failed link keeps
     * the window open with the failed targets; the next save creates them.
     * @param {Object} data {data, isNew}
     * @returns {Promise<void>}
     * @protected
     */
    async afterSave(data) {
        let me = this,
            id = data.data?.id,
            linked = true;

        if (id && (data.isNew || me.hasPendingLinks())) {
            linked = await me.createPendingLinks(id);

            if (me.isDestroyed) {
                return
            }

            me.updateLinkButtons()
        }

        me.fire('save', data);
        me.closeOnSave && linked && me.close()
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
    async isModified() {
        return !!this.createLinkButton?.isModified || await this.form.isModified()
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
