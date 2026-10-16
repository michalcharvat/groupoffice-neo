import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import client        from '../../jmap/Client.mjs';
import ActionTable   from '../../list/ActionTable.mjs';
import {notifyError} from '../../Notify.mjs';
import {entityTitle, moduleTitle} from '../../systemsettings/moduleTitles.mjs';
import {t}           from '../../Translate.mjs';
import EntityFieldsDialog from './EntityFieldsDialog.mjs';

/**
 * System settings card "Custom fields" (go.customfields.SystemSettingsPanel, core right
 * mayChangeCustomFields): the entities that support custom fields with their module;
 * edit opens the entity's field sets and fields.
 */
class CustomFieldsPanel extends Container {
    static config = {
        className: 'GO.customfields.admin.CustomFieldsPanel',
        baseCls  : ['go-systemsettings-panel', 'go-entity-list-panel', 'go-cf-admin-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module     : ActionTable,
            reference  : 'table',
            flex       : 'none',
            keyProperty: 'name',
            columns    : [
                {text: t('Name'),   field: 'title', flex: true},
                {text: t('Module'), field: 'moduleTitle'}
            ],
            actions  : [{action: 'edit', icon: 'edit', tooltip: t('Edit')}],
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
                    entity.supportsCustomFields && rows.push({
                        name       : entity.name,
                        title      : entityTitle(entity.name, module),
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
        Neo.create(EntityFieldsDialog, {
            appName    : this.appName,
            windowId   : this.windowId,
            forEntity  : record.name,
            entityTitle: record.title
        })
    }
}

export default Neo.setupClass(CustomFieldsPanel);
