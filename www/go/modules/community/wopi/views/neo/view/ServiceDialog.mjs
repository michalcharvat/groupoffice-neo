import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {LEVEL_READ, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import SharePanel   from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'wopi');

/**
 * WOPI service (wopi ServiceDialog): its URL, an alternative WOPI client URI for Microsoft
 * Office Online, and who may use it (read / write)
 */
class ServiceDialog extends FormWindow {
    static config = {
        className   : 'GO.wopi.view.ServiceDialog',
        entityName  : 'WopiService',
        title       : t('Service'),
        wrapperStyle: {height: 'min(600px, 90vh)', left: 'calc(50vw - 350px)', top: '5vh', width: 'min(700px, 100vw)'}
    }

    createFormItems() {
        let me = this;

        return [{
            module       : TextField,
            name         : 'url',
            labelText    : t('URL'),
            labelPosition: 'inline',
            required     : true
        }, {
            // not a property: switches wopiClientUri on
            module    : BoolCheckBox,
            reference : 'useAltWopiClientUri',
            valueLabel: t('Use alternative WOPI client URI (Only for Microsoft Office Online'),
            listeners : {change: ({value}) => me.onAltUriChange(!!value)}
        }, {
            module       : TextField,
            name         : 'wopiClientUri',
            reference    : 'wopiClientUri',
            labelText    : t('WOPI client URI'),
            labelPosition: 'inline',
            disabled     : true
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            flex : 'none',
            text : t('Only for use with Microsoft Office Online. WOPI traffic must be tunneled through a wopi subdomain.')
        }]
    }

    addCustomFields() {
        // WopiService has no custom fields
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.addCard({
            header: {text: coreT('Permissions')},
            items : [{
                module   : SharePanel,
                reference: 'sharePanel',
                flex     : 1,
                levels   : [{value: '', name: ''}, {value: LEVEL_READ, name: coreT('Read')}, {value: LEVEL_WRITE, name: coreT('Write')}]
            }]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('WopiService', currentId || null).catch(e => console.error('SharePanel', e));
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        });

        me.form.on({
            load      : ({data}) => {
                me.getReference('useAltWopiClientUri').value = !!data.wopiClientUri;
                me.getReference('wopiClientUri').disabled    = !data.wopiClientUri
            },
            beforesave: ({data}) => {
                me.getReference('useAltWopiClientUri').value || (data.wopiClientUri = null)
            }
        });

        return result
    }

    /**
     * ExtJS: the field is enabled with the switch, its default is GO's URL + "/wopi/"
     * @param {Boolean} enabled
     */
    async onAltUriChange(enabled) {
        let me    = this,
            field = me.getReference('wopiClientUri');

        field.disabled = !enabled;

        if (enabled && !field.value) {
            try {
                const {list} = await client.queryGet('Module', {filter: {package: 'core', name: 'core'}, properties: ['id', 'settings']}),
                      url    = list[0]?.settings?.URL;

                url && !me.isDestroyed && !field.value && (field.value = url.replace(/\/$/, '') + '/wopi/')
            } catch (e) {
                console.warn('wopi: core URL', e)
            }
        }
    }
}

export default Neo.setupClass(ServiceDialog);
