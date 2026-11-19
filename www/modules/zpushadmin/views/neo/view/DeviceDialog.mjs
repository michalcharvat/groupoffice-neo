import TextArea         from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox     from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client           from '../../../../../views/neo/src/jmap/Client.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {translator}     from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'zpushadmin');

/**
 * An ActiveSync device (GO.zpushadmin.DeviceDialog, zpushadmin/device/load|submit): whether
 * it may connect and a comment; id and type are shown only.
 *
 *     DeviceDialog.open({appName, windowId, id}) // → the dialog, after loading
 */
class DeviceDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.zpushadmin.view.DeviceDialog',
        title       : t('Device'),
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 260px)', top: '15vh', width: 'min(520px, 100vw)'},
        /**
         * Device id (zpa_devices.id)
         * @member {String|Number|null} deviceKey=null
         */
        deviceKey: null
    }

    /**
     * Loads the device, then shows the dialog
     * @param {Object} config appName, windowId, id
     * @returns {Promise<DeviceDialog>}
     */
    static async open({id, ...config}) {
        const {data} = await client.legacy('zpushadmin/device/load', {id});

        return Neo.create(DeviceDialog, {
            ...config,
            deviceKey: id,
            values   : {
                device_id  : data.device_id || '',
                device_type: data.device_type || '',
                can_connect: !!data.can_connect,
                comment    : data.comment || ''
            }
        })
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'device_id',
            labelText    : t('Device'),
            labelPosition: 'inline',
            readOnly     : true,
            clearable    : false
        }, {
            module       : TextField,
            name         : 'device_type',
            labelText    : t('Device Type'),
            labelPosition: 'inline',
            readOnly     : true,
            clearable    : false
        }, {
            module    : BoolCheckBox,
            name      : 'can_connect',
            valueLabel: t('Can connect')
        }, {
            module       : TextArea,
            name         : 'comment',
            labelText    : t('Comments'),
            labelPosition: 'inline',
            height       : 120
        }]
    }

    addCustomFields() {
        // a legacy record without custom fields
    }

    async save(modified) {
        const params = {id: this.deviceKey};

        // only what the dialog may change (the controller would take every posted attribute)
        'can_connect' in modified && (params.can_connect = modified.can_connect ? 1 : 0);
        'comment' in modified && (params.comment = modified.comment ?? '');

        Object.keys(params).length > 1 && await client.legacy('zpushadmin/device/submit', params);
        return {id: this.deviceKey}
    }
}

export default Neo.setupClass(DeviceDialog);
