import AutocompleteChips from '../form/field/AutocompleteChips.mjs';
import ChipsField from '../form/field/ChipsField.mjs';
import client from '../jmap/Client.mjs';
import {t} from '../Translate.mjs';
import SelectSearchDialog from './SelectSearchDialog.mjs';

const SEARCH_PROPERTIES = ['id', 'name', 'entity', 'entityId', 'filter'];

/**
 * Items to link to an entity that is not saved yet (GOUI CreateLinkField): chips of
 * core `Search` results. The ▾ button lists the newest items (filtered by the typed
 * text), Enter adds the first match, the search button opens a SelectSearchDialog.
 *
 * Value: [{entity, entityId}], the targets for createLinks() once the entity exists.
 */
class CreateLinkField extends AutocompleteChips {
    static config = {
        className   : 'GO.link.CreateLinkField',
        ntype       : 'go-createlinkfield',
        baseCls     : ['go-field', 'go-chipsfield', 'go-autocompletechips', 'go-createlinkfield'],
        entity      : 'Search',
        displayField: 'name',
        jmapSort    : [{property: 'modifiedAt', isAscending: false}],
        limit       : 20,
        /**
         * Item that gets the links, left out of the results: {entity, entityId}
         * @member {Object|null} exclude=null
         */
        exclude: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.pickerRecordToValue = CreateLinkField.toValue;

        // values set from outside (addLink()) have no chip text yet
        me.chipRenderer = async ({entity, entityId}) => {
            const {list} = await client.queryGet('Search', {
                filter    : {entities: [{name: entity}], entityId: String(entityId)},
                limit     : 1,
                properties: ['id', 'name']
            });

            return list[0]?.name ?? `${entity} #${entityId}`
        }
    }

    /**
     * @param {Object} record Search record
     * @returns {Object} {entity, entityId}
     */
    static toValue(record) {
        return {entity: record.entity, entityId: String(record.entityId)}
    }

    async query(text, limit) {
        let me = this;

        const {list} = await client.queryGet('Search', {
            filter    : text ? {text} : {},
            sort      : me.jmapSort,
            limit,
            properties: SEARCH_PROPERTIES
        });

        const {exclude} = me;

        return list.filter(r => !(exclude && r.entity === exclude.entity && String(r.entityId) === String(exclude.entityId)))
    }

    createControl() {
        let me      = this,
            control = super.createControl();

        if (!me.readOnly && !me.disabled) {
            control.push({
                tag  : 'button',
                type : 'button',
                cls  : ['go-chips-trigger', 'go-createlink-browse'],
                title: t('Search'),
                cn   : [{tag: 'i', cls: ['go-icon'], text: 'search'}]
            })
        }

        return control
    }

    onBoxClick(data) {
        if (data.path.some(node => node.cls?.includes('go-createlink-browse'))) {
            this.openSearch();
            return
        }

        super.onBoxClick(data)
    }

    /**
     * Picks items in a SelectSearchDialog and adds them
     */
    openSearch() {
        let me = this;

        if (me.readOnly || me.disabled) {
            return
        }

        me.closeMenu();

        const dialog = Neo.create(SelectSearchDialog, {
            appName : me.appName,
            exclude : me.exclude,
            windowId: me.windowId
        });

        dialog.on('select', ({records}) => {
            if (me.isDestroyed) {
                return
            }

            const current = me.value || [],
                  keys    = new Set(current.map(v => ChipsField.key(v))),
                  added   = [];

            records.forEach(record => {
                const value = CreateLinkField.toValue(record),
                      key   = ChipsField.key(value);

                me.chipTexts.set(key, String(record.name ?? ''));
                keys.has(key) || (keys.add(key), added.push(value))
            });

            added.length && me.userChange([...current, ...added])
        })
    }
}

export default Neo.setupClass(CreateLinkField);
