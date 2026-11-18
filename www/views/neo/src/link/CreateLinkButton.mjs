import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button from '../button/Button.mjs';
import ChipsField from '../form/field/ChipsField.mjs';
import {t} from '../Translate.mjs';
import CreateLinkField from './CreateLinkField.mjs';
import {createLinks} from './links.mjs';

/**
 * Button bar item of a FormWindow for a new entity (GOUI CreateLinkButton, an
 * OverlayToolbarButton): the link button with the number of pending links opens a
 * CreateLinkField over the whole button bar, the back button closes it again.
 *
 * Holds the pending links: the entity has no id yet, so FormWindow calls
 * createLinksFor() once the first save created it.
 *
 * Fires `change` {links} when the pending links change, `openChange` {open}.
 */
class CreateLinkButton extends Container {
    static config = {
        className: 'GO.link.CreateLinkButton',
        cls      : ['go-create-link'],
        layout   : {ntype: 'hbox', align: 'center'},
        /**
         * Open: the field covers the button bar
         * @member {Boolean} open_=false
         */
        open_: false
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : Button,
            reference: 'openButton',
            icon     : 'link',
            tooltip  : t('Create links'),
            handler  : () => me.open = true
        }, {
            module   : Button,
            reference: 'backButton',
            icon     : 'arrow_back',
            tooltip  : t('Back'),
            hidden   : true,
            handler  : () => me.open = false
        }, {
            module     : CreateLinkField,
            reference  : 'field',
            flex       : 1,
            hidden     : true,
            placeholder: t('Search') + '...',
            listeners  : {
                change: () => me.onLinksChange()
            }
        }]
    }

    /**
     * @returns {GO.link.CreateLinkField}
     */
    get field() {
        return this.getReference('field')
    }

    /**
     * Pending links
     * @returns {Object[]} [{entity, entityId}]
     */
    get links() {
        return [...(this.field?.value || [])]
    }

    /**
     * The user added or removed links (links from addLink() alone are no change)
     * @returns {Boolean}
     */
    get isModified() {
        return !!this.field && !this.field.clean
    }

    afterSetOpen(value, oldValue) {
        let me = this;

        if (oldValue === undefined) {
            return
        }

        me.toggleCls('go-create-link-open', value);
        // neo's flex layout reads `flex` once, when it adds the item
        me.style = {...me.style, flex: value ? '1 1 0%' : '0 0 auto'};
        me.getReference('openButton').hidden = value;
        me.getReference('backButton').hidden = !value;
        me.field.hidden = !value;

        me.fire('openChange', {open: value});
        value && me.timeout(50).then(() => me.isDestroyed || me.field.focus(me.field.id + '__input'))
    }

    /**
     * Adds a pending link, e.g. to the item a new entity is created from
     * (GOUI FormWindow.addLinkOnSave())
     * @param {String} entity
     * @param {String|Number} entityId
     */
    addLink(entity, entityId) {
        let me      = this,
            value   = CreateLinkField.toValue({entity, entityId}),
            current = me.links;

        if (!current.some(v => v.entity === value.entity && v.entityId === value.entityId)) {
            // the field's change event updates the count
            me.field.value = [...current, value]
        }
    }

    /**
     * @protected
     */
    onLinksChange() {
        let me    = this,
            links = me.links;

        me.getReference('openButton').text = links.length ? String(links.length) : '';
        me.fire('change', {links})
    }

    /**
     * Creates the pending links from the saved entity. Linked targets leave the
     * field; failed ones stay for another try. Targets added while the request runs
     * are kept.
     * @param {String} entity
     * @param {String|Number} entityId
     * @returns {Promise<Number>} number of links created
     */
    async createLinksFor(entity, entityId) {
        let me    = this,
            links = me.links,
            created, error;

        try {
            created = await createLinks(entity, entityId, links)
        } catch (e) {
            created = e.created || [];
            error   = e
        }

        if (!me.isDestroyed) {
            const done = new Set(created.map(v => ChipsField.key(v))),
                  left = me.links.filter(v => !done.has(ChipsField.key(v)));

            if (left.length) {
                done.size && (me.field.value = left)
            } else {
                // saved: nothing pending, no unsaved change
                me.field.reset([]);
                me.open = false
            }
        }

        if (error) {
            throw error
        }

        return created.length
    }
}

export default Neo.setupClass(CreateLinkButton);
