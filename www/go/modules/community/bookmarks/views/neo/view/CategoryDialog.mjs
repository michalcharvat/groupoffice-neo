import SharePanel   from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {t}          from '../util.mjs';

/**
 * Create or edit a bookmark category (GOUI CategoryDialog): name and, on a second tab,
 * who it is shared with (acl).
 */
class CategoryDialog extends FormWindow {
    static config = {
        className : 'GO.bookmarks.CategoryDialog',
        cls       : ['go-form-window', 'go-bookmarks-category-dialog'],
        entityName: 'BookmarksCategory',
        properties: ['id', 'name', 'acl'],
        title     : t('Category'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 300px)', top: '15vh', width: '600px'},
        /**
         * Id when editing, null for a new category (= entityId)
         * @member {String|null} categoryId=null
         */
        categoryId: null,
        /**
         * Initial name of a new category
         * @member {String} name=''
         */
        name: ''
    }

    construct(config) {
        config.categoryId && (config.entityId ??= config.categoryId);
        config.values ??= {name: config.name || ''};

        super.construct(config);

        this.on('save', ({data}) => this.fire('saved', {id: data.id}))
    }

    onConstructed() {
        // the cards exist from here on; 'formReady' fires later, after the load
        const result = super.onConstructed();
        this.addSharePanel();
        return result
    }

    /**
     * "Permissions" tab: the acl property as a form field
     */
    addSharePanel() {
        let me = this;

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        // the ACL members are listed first; a new category gets the default ACL
        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('BookmarksCategory', currentId || null).catch(e => console.error('SharePanel', e));

            // a new category's default ACL arrives after the form took its unmodified state
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        })
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true
        }]
    }
}

export default Neo.setupClass(CategoryDialog);
