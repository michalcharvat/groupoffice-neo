import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import JmapStore    from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import Grid         from '../../../../../../../views/neo/src/grid/Grid.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog       from '../../../../../../../views/neo/src/view/Dialog.mjs';
import ContactModel from '../model/Contact.mjs';
import {contactAvatarHtml, t} from '../util.mjs';

// ExtJS DuplicateDialog checkboxes: the properties that must be equal
const DUPLICATE_PROPERTIES = [
    ['name', t('Name'), true],
    ['isOrganization', t('Organisation or contact'), true],
    ['emailAddresses', t('E-mail addresses'), false],
    ['phoneNumbers', t('Phone numbers'), false],
    ['addressBookId', t('Address book'), false]
];

/**
 * "Look for duplicates" (ExtJS DuplicateDialog): contacts that are equal in the
 * checked properties (Contact filter "duplicate"); merge the selected ones.
 */
class DuplicateDialog extends Dialog {
    static config = {
        className   : 'GO.addressbook.view.DuplicateDialog',
        cls         : ['go-addressbook-duplicate-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Filter duplicates'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 500px)', top: '10vh', width: '1000px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            style : {flexWrap: 'wrap'},
            items : [...DUPLICATE_PROPERTIES.map(([name, label, checked]) => ({
                module    : BoolCheckBox,
                reference : 'dup-' + name,
                valueLabel: label,
                checked,
                flex      : 'none',
                listeners : {change: () => me.doFilter()}
            })), '->', {
                module   : SearchButton,
                listeners: {search: ({text}) => me.getReference('grid').store.setFilter({text: text || undefined}).catch(() => {})}
            }]
        }, {
            module     : Grid,
            reference  : 'grid',
            flex       : 1,
            multiSelect: true,
            store      : {
                module    : JmapStore,
                entity    : 'Contact',
                model     : ContactModel,
                pageSize  : 100,
                scrollLoad: true,
                sorters   : [{property: 'name', direction: 'ASC'}],
                properties: ['id', 'name', 'isOrganization', 'color', 'photoBlobId', 'emailAddresses', 'phoneNumbers',
                             'addressBookId', 'permissionLevel']
            },
            columns: [{
                dataField: 'photoBlobId',
                text     : '',
                width    : 56,
                sortable : false,
                hideable : false,
                renderer : ({record}) => contactAvatarHtml(record, ['go-avatar-small'])
            }, {
                dataField: 'name',
                text     : t('Name'),
                flex     : 1,
                hideable : false,
                renderer : ({value}) => escapeHtml(value)
            }, {
                dataField: 'emailAddresses',
                text     : t('E-mail addresses'),
                width    : 260,
                sortable : false,
                renderer : ({value}) => escapeHtml((value || []).map(m => m.email).join(', '))
            }, {
                dataField: 'phoneNumbers',
                text     : t('Phone numbers'),
                width    : 200,
                sortable : false,
                renderer : ({value}) => escapeHtml((value || []).map(p => p.number).join(', '))
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                ui     : 'primary',
                text   : t('Merge selected'),
                handler: () => me.mergeSelected()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        grid.body.on('scrollEdge', () => grid.store.loadMore().catch(() => {}));
        grid.store.on('loadError', ({error}) => notifyError(me, error));

        me.doFilter()
    }

    doFilter() {
        let me        = this,
            duplicate = DUPLICATE_PROPERTIES.map(([name]) => name).filter(name => me.getReference('dup-' + name)?.checked);

        me.getReference('grid').store.setFilter({
            permissionLevel: LEVEL_DELETE,
            duplicate      : duplicate.length ? duplicate : undefined
        }).catch(() => {})
    }

    async mergeSelected() {
        let me   = this,
            grid = me.getReference('grid'),
            ids  = grid.getSelectedRecords().map(r => r.id);

        if (ids.length < 2) {
            notifyError(me, new Error(t('Please select at least two items to merge.')));
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t("Are you sure you want to merge the selected items? This can't be undone.")
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.call('Contact/merge', {ids});
            // a merge does not reach other stores by push (ExtJS getUpdates())
            me.fire('merged', {ids});
            grid.view.selectionModel.clear();
            grid.store.load().catch(() => {})
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(DuplicateDialog);
