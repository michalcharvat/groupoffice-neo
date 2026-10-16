import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import {notifyError} from '../Notify.mjs';
import {t}           from '../Translate.mjs';
import DefaultAclDialog from './DefaultAclDialog.mjs';
import {entityTitle, moduleTitle} from '../systemsettings/moduleTitles.mjs';

/**
 * System settings card "Default permissions" (go.defaultpermissions.SystemSettingsPanel,
 * admins): every ACL owning entity with its module; edit opens its default ACL.
 */
class DefaultPermissionsPanel extends Container {
    static config = {
        className: 'GO.defaultpermissions.DefaultPermissionsPanel',
        baseCls  : ['go-systemsettings-panel', 'go-entity-list-panel', 'go-defaultpermissions-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            tag  : 'p',
            cls  : ['go-systemsettings-text'],
            flex : 'none',
            text : t('Select an entity to manage the default permissions when new items are created.')
        }, {
            module   : ActionTable,
            reference: 'table',
            flex     : 'none',
            keyProperty: 'name',
            columns  : [
                {text: t('Name'),   field: 'title', flex: true},
                {text: t('Module'), field: 'moduleTitle'}
            ],
            actions  : [{action: 'edit', icon: 'edit', tooltip: t('Manage default permissions')}],
            listeners: {
                action        : ({record}) => me.edit(record),
                rowDoubleClick: ({record}) => me.edit(record)
            }
        }]
    }

    /**
     * Called by the System settings dialog when it opens
     */
    async load() {
        let me = this;

        try {
            // the server needs package and name to compute entities
            const {list} = await client.queryGet('Module', {properties: ['id', 'package', 'name', 'enabled', 'entities']}),
                  rows   = [];

            list.filter(module => module.enabled !== false).forEach(module => {
                Object.values(module.entities || {}).forEach(entity => {
                    // every ACL owner has a default ACL; an empty one comes as null
                    entity.isAclOwner && rows.push({
                        name       : entity.name,
                        title      : entityTitle(entity.name, module),
                        moduleId   : module.id,
                        moduleTitle: moduleTitle(module)
                    })
                })
            });

            rows.sort((a, b) => a.title.localeCompare(b.title));
            me.isDestroyed || (me.getReference('table').records = rows)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object} record
     */
    edit(record) {
        Neo.create(DefaultAclDialog, {
            appName    : this.appName,
            windowId   : this.windowId,
            forEntity  : record.name,
            moduleId   : record.moduleId,
            entityTitle: record.title
        })
    }
}

export default Neo.setupClass(DefaultPermissionsPanel);
