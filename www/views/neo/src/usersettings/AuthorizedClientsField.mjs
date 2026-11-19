import HiddenField    from '../../node_modules/neo.mjs/src/form/field/Hidden.mjs';
import ArrayField     from '../form/field/ArrayField.mjs';
import ContainerField from '../form/field/ContainerField.mjs';
import SelectField    from '../form/field/SelectField.mjs';
import {formatUserDateTime} from '../Format.mjs';
import {t}            from '../Translate.mjs';

/**
 * The User's `clients` (go.usersettings.AccountSettingsPanel "Authorized clients"): one row
 * per device or browser that logged in, with its IP, platform, name and last seen time,
 * and a status to allow or deny it. logoutAll() empties the map, which logs out every
 * client on save.
 *
 * Value: the map {clientId: {status}}. A client left out of the map is deleted
 * (Property::patchMap()): the dialog saves toPatch() instead of the value.
 */
class AuthorizedClientsField extends ArrayField {
    static config = {
        className: 'GO.usersettings.AuthorizedClientsField',
        ntype    : 'go-authorizedclientsfield',
        baseCls  : ['go-authorizedclients', 'go-arrayfield', 'neo-container'],
        buildField(client) {
            return {
                module: ContainerField,
                cls   : ['go-authorizedclients-row'],
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    module: HiddenField,
                    name  : 'id'
                }, {
                    ntype: 'component',
                    cls  : ['go-authorizedclients-client'],
                    flex : 1,
                    vdom : {cn: [
                        {tag: 'div', text: client.ip || '?'},
                        {tag: 'div', text: (client.platform || '?') + ' ' + (client.name || '?')},
                        {tag: 'div', cls: ['go-authorizedclients-seen'], text: formatUserDateTime(client.lastSeen) || '?'}
                    ]}
                }, {
                    module   : SelectField,
                    name     : 'status',
                    flex     : 'none',
                    cls      : ['go-authorizedclients-status'],
                    options  : [
                        {value: 'new',     text: t('New')},
                        {value: 'allowed', text: t('Allowed')},
                        {value: 'denied',  text: t('Denied')}
                    ]
                }]
            }
        }
    }

    getSubmitValue() {
        return Object.fromEntries(this.getRows().map(row => {
            const {id, status} = row.getSubmitValue();
            return [String(id), {status}]
        }))
    }

    /**
     * @param {Object|null} value the User's clients map
     * @param {Boolean} [reset=false]
     */
    applyValue(value, reset = false) {
        // the last seen first
        const list = Object.entries(value || {})
            .map(([id, client]) => ({...client, id: client.id ?? id}))
            .sort((a, b) => String(b.lastSeen || '').localeCompare(String(a.lastSeen || '')));

        super.applyValue(list, reset)
    }

    /**
     * The change as JMAP patch of the user: only the changed statuses ("clients/5/status"),
     * so clients that logged in after loading stay, and other status changes are not
     * overwritten. After "Logout all" the empty map, which removes them all.
     * @param {String} name property of the user, e.g. 'clients'
     * @returns {Object}
     */
    toPatch(name) {
        const value    = this.getSubmitValue(),
              original = this.originalValue || {};

        if (!Object.keys(value).length) {
            return {[name]: {}}
        }

        return Object.fromEntries(Object.entries(value)
            .filter(([id, {status}]) => original[id]?.status !== status)
            .map(([id, {status}]) => [name + '/' + id + '/status', status]))
    }

    /**
     * Removes all clients: saving logs them all out
     */
    logoutAll() {
        this.applyValue({});
        this.fireChange()
    }
}

export default Neo.setupClass(AuthorizedClientsField);
