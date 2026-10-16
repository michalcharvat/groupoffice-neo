import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import MenuList     from '../../../../../../../views/neo/src/menu/List.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {fmt, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import calendarData from '../data.mjs';
import ResourceDialog from './ResourceDialog.mjs';
import ResourceGroupDialog from './ResourceGroupDialog.mjs';

const t = translator('community', 'calendar');

/**
 * Manage resources (GOUI ResourcesWindow): resource groups on the left, the resources of
 * the selected group on the right, each with edit and delete.
 */
class ResourcesDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.ResourcesDialog',
        cls         : ['go-cal-resources-dialog'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('maximize', 'close'),
        title       : t('Manage resources'),
        wrapperStyle: {height: '600px', left: 'calc(50vw - 450px)', top: '10vh', width: '900px'},
        containerConfig: {layout: {ntype: 'hbox', align: 'stretch'}}
    }

    /** @member {String|null} groupId selected group */
    groupId = null
    /** @member {Object[]} resources */
    resources = []

    construct(config) {
        super.construct(config);

        let me = this;

        const list = (reference, menuPrefix, onClick, onMenu) => ({
            module      : Component,
            reference,
            cls         : ['go-cal-resources-list'],
            flex        : 1,
            vdom        : {tag: 'ul', cn: []},
            domListeners: [
                {click: onMenu,  delegate: '.go-row-menu', scope: me},
                {click: onClick, delegate: '.go-cal-res-row', scope: me}
            ]
        });

        me.items = [{
            ntype : 'container',
            cls   : ['go-cal-resources-groups'],
            width : 300,
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : [{ntype: 'component', tag: 'h3', text: t('Group')}, '->', {
                    module : Button,
                    icon   : 'add',
                    ui     : 'secondary',
                    handler: () => me.openGroup(null)
                }]
            }, list('groupList', 'g', me.onGroupClick, me.onGroupMenu)]
        }, {
            ntype : 'container',
            cls   : ['go-cal-resources-main'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : [{ntype: 'component', tag: 'h3', text: t('Resources')}, '->', {
                    module : Button,
                    icon   : 'add',
                    ui     : 'primary',
                    tooltip: t('Add'),
                    handler: () => me.openResource(null)
                }]
            }, list('resourceList', 'r', me.onResourceClick, me.onResourceMenu)]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.removeListener = calendarData.on('change', ({type}) => {
            type === 'resourceGroups' && me.renderGroups()
        });

        // push: groups and resources changed
        me.removeStateListener = client.on('stateChange', ({changed}) => {
            changed.includes('Calendar') && me.loadResources()
        });

        calendarData.loadResourceGroups().then(() => {
            if (me.isDestroyed) {
                return
            }
            me.groupId ??= calendarData.resourceGroups[0]?.id || null;
            me.renderGroups();
            me.loadResources()
        }).catch(e => notifyError(me, e))
    }

    destroy(...args) {
        this.removeListener?.();
        this.removeStateListener?.();
        super.destroy(...args)
    }

    renderGroups() {
        const list = this.getReference('groupList');

        list.vdom.cn = calendarData.resourceGroups.map(g => ({
            tag: 'li', cls: ['go-cal-res-row', g.id === this.groupId ? 'selected' : null].filter(Boolean), 'data-gid': g.id, cn: [
                {tag: 'span', cls: ['go-cal-res-name'], text: g.name},
                {tag: 'i', id: `${this.id}__g_${g.id}`, cls: ['go-icon', 'go-row-menu'], text: 'more_vert'}
            ]
        }));

        list.update()
    }

    async loadResources() {
        let me = this;

        if (!me.groupId) {
            me.resources = [];
            me.renderResources();
            return
        }

        try {
            const {list} = await client.queryGet('Calendar', {filter: {isResource: true, groupId: me.groupId}, sort: [{property: 'sortOrder'}, {property: 'name'}], properties: ['id', 'name', 'color', 'groupId']});
            me.resources = list;
            me.isDestroyed || me.renderResources()
        } catch (e) {
            notifyError(me, e)
        }
    }

    renderResources() {
        const list = this.getReference('resourceList');

        list.vdom.cn = this.resources.map(r => ({
            tag: 'li', cls: ['go-cal-res-row'], 'data-rid': String(r.id), cn: [
                {tag: 'span', cls: ['go-cal-res-color'], style: {backgroundColor: '#' + (r.color || '69554f')}},
                {tag: 'span', cls: ['go-cal-res-name'], text: r.name},
                {tag: 'i', id: `${this.id}__r_${r.id}`, cls: ['go-icon', 'go-row-menu'], text: 'more_vert'}
            ]
        }));

        list.update()
    }

    static idOf(data, key) {
        return data.path.find(n => n.data?.[key])?.data[key]
    }

    onGroupClick(data) {
        if (data.path.some(n => n.cls?.includes('go-row-menu'))) {
            return
        }

        const id = ResourcesDialog.idOf(data, 'gid');

        if (id && id !== this.groupId) {
            this.groupId = id;
            this.renderGroups();
            this.loadResources()
        }
    }

    onResourceClick(data) {
        if (data.path.some(n => n.cls?.includes('go-row-menu'))) {
            return
        }

        const id = ResourcesDialog.idOf(data, 'rid');
        id && this.openResource(id)
    }

    showMenu(target, items) {
        MenuList.showAt({appName: this.appName, windowId: this.windowId, target, items})
    }

    onGroupMenu(data) {
        let me = this,
            id = ResourcesDialog.idOf(data, 'gid'),
            g  = calendarData.resourceGroups.find(x => x.id === id);

        g && me.showMenu(`${me.id}__g_${id}`, [
            {text: t('Edit'), icon: 'edit', handler: () => me.openGroup(id)},
            {separator: true},
            {text: t('Delete'), icon: 'delete', handler: () => me.destroyEntity('ResourceGroup', id, g.name, t('Could not delete non-empty resource group'))}
        ])
    }

    onResourceMenu(data) {
        let me = this,
            id = ResourcesDialog.idOf(data, 'rid'),
            r  = me.resources.find(x => String(x.id) === id);

        r && me.showMenu(`${me.id}__r_${id}`, [
            {text: t('Edit'), icon: 'edit', handler: () => me.openResource(id)},
            {separator: true},
            {text: t('Delete'), icon: 'delete', handler: () => me.destroyEntity('Calendar', id, r.name)}
        ])
    }

    async destroyEntity(entity, id, name, failText) {
        let me = this;

        const ok = await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId, message: fmt(t("Are you sure you want to delete '{item}'?"), {item: name})});

        if (!ok) {
            return
        }

        try {
            await client.set(entity, {destroy: [id]});
            entity === 'ResourceGroup' && id === me.groupId && (me.groupId = null)
        } catch (e) {
            notifyError(me, failText ? new Error(failText) : e)
        }
    }

    openGroup(id) {
        Neo.create(ResourceGroupDialog, {appName: this.appName, windowId: this.windowId, entityId: id})
    }

    openResource(id) {
        Neo.create(ResourceDialog, {appName: this.appName, windowId: this.windowId, entityId: id, values: id ? {} : {groupId: this.groupId}})
    }
}

export default Neo.setupClass(ResourcesDialog);
