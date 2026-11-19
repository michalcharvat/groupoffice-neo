import TextField    from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../form/field/BoolCheckBox.mjs';
import FormWindow   from '../view/FormWindow.mjs';
import {t}          from '../Translate.mjs';

/** AppPasswordScope protocols */
const PROTOCOLS = [
    {protocol: 'dav',        text: 'WebDAV, CalDAV, CardDAV'},
    {protocol: 'activesync', text: 'Microsoft ActiveSync'}
];

/**
 * New app password (go.usersettings.AppPasswordDialog): a label and the protocols it may
 * log in to. The server generates the secret and returns it only in the create response
 * (`created.secret` of the save event): AppPasswordsPanel shows it once. Open it with
 * `values: {userId}`.
 */
class AppPasswordDialog extends FormWindow {
    static config = {
        className   : 'GO.usersettings.AppPasswordDialog',
        entityName  : 'AppPassword',
        title       : t('New app password'),
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 230px)', top: '20vh', width: 'min(460px, 100vw)'}
    }

    onConstructed() {
        const promise = super.onConstructed();

        // one checkbox per protocol (scopes.dav: true) → scopes [{protocol: 'dav'}]
        this.form.on('beforesave', ({data}) => {
            if (data.scopes && !Array.isArray(data.scopes)) {
                data.scopes = PROTOCOLS.filter(({protocol}) => data.scopes[protocol]).map(({protocol}) => ({protocol}))
            }
        });

        return promise
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'label',
            labelText    : t('Label'),
            labelPosition: 'inline',
            required     : true
        }, {
            ntype: 'component',
            tag  : 'h4',
            cls  : ['go-apppassword-protocols'],
            text : t('Protocols')
        }, ...PROTOCOLS.map(({protocol, text}) => ({
            module    : BoolCheckBox,
            name      : 'scopes.' + protocol,
            valueLabel: text
        }))]
    }

    addCustomFields() {
        // AppPassword has no custom fields
    }
}

export default Neo.setupClass(AppPasswordDialog);
