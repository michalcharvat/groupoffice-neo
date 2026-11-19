import TextArea      from '../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {t}           from '../Translate.mjs';
import Dialog        from '../view/Dialog.mjs';

/** where an administrator registers for a trial license of this host (go.license.LicenseDialog) */
const TRIAL_URL = 'https://www.group-office.com/account#trial/';

/**
 * Enter the license key, or decline the license (go.license.LicenseDialog). Saves the core
 * module settings `license` and `licenseDenied`; all windows reload after a save, because
 * a license changes which modules are available. Administrators open it from the user
 * menu ("Register") and from System settings → Modules ("Trial license").
 *
 *     Neo.create(LicenseDialog, {appName, windowId})
 */
class LicenseDialog extends Dialog {
    static config = {
        className   : 'GO.license.LicenseDialog',
        cls         : ['go-license-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Register'),
        wrapperStyle: {
            height: 'min(460px, 90vh)',
            left  : 'max(0px, calc(50vw - 300px))',
            top   : 'max(5vh, calc(50vh - 230px))',
            width : 'min(600px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * Id of the core Module
     * @member {String|null} coreId=null
     */
    coreId = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            cls   : ['go-license-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'component',
                tag  : 'p',
                flex : 'none',
                // translation from the language files: a link to the website
                html : t('Try the extra features for free and obtain a 60 day trial license from <a target="_blank" class="normal-link" href="https://www.group-office.com">www.group-office.com</a>. Register for an account and get your license now. By purchasing a license you will get support and extra features. Find out more on our website.')
            }, {
                ntype : 'container',
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'start'},
                items : [{
                    module : Button,
                    ui     : 'primary',
                    text   : t('Get license now'),
                    handler: () => me.openTrialPage()
                }]
            }, {
                module       : TextArea,
                reference    : 'license',
                cls          : ['go-license-key'],
                flex         : 1,
                labelText    : t('License key'),
                labelPosition: 'inline',
                disabled     : true
            }, {
                ntype    : 'component',
                reference: 'readOnlyInfo',
                cls      : ['go-systemsettings-info'],
                flex     : 'none',
                hidden   : true,
                html     : `<i class="go-icon">info</i>${t("Some fields on this page can't be edited because they have been locked in the server configuration file.")}`
            }, {
                ntype    : 'component',
                reference: 'error',
                cls      : ['go-form-error'],
                flex     : 'none',
                text     : ''
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                module : Button,
                text   : t('Later'),
                handler: () => me.close()
            }, {
                module   : Button,
                reference: 'denyButton',
                disabled : true,
                text     : t('No thanks'),
                handler  : () => me.save(true)
            }, '->', {
                module   : Button,
                reference: 'saveButton',
                ui       : 'primary',
                disabled : true,
                text     : t('Save'),
                handler  : () => me.save(false)
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            const {list} = await client.queryGet('Module', {filter: {package: 'core', name: 'core'}, properties: ['id', 'package', 'name', 'settings']}),
                  core   = list[0];

            if (!core) {
                throw new Error(t('Not found'))
            }

            if (me.isDestroyed) {
                return
            }

            const locked = (core.settings?.readOnlyKeys || []).includes('license');

            me.coreId = core.id;
            me.getReference('license').value = core.settings?.license || '';
            me.getReference('readOnlyInfo').hidden = !locked;
            me.setLocked(locked)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Boolean} locked the license field and the save buttons are disabled
     * @protected
     */
    setLocked(locked) {
        let me = this;

        ['license', 'denyButton', 'saveButton'].forEach(ref => me.getReference(ref).disabled = locked)
    }

    /**
     * The website's trial page for this host, in a new tab
     * @protected
     */
    openTrialPage() {
        Neo.Main.windowOpen({url: TRIAL_URL + globalThis.location.hostname, windowId: this.windowId, windowName: '_blank'})
    }

    /**
     * Saves the license key, or that the administrator declined a license, and reloads
     * @param {Boolean} denied "No thanks"
     * @protected
     */
    async save(denied) {
        let me      = this,
            license = denied ? null : String(me.getReference('license').value ?? '').trim();

        if (!denied && !license) {
            me.getReference('error').text = t('Please enter the license key');
            return
        }

        if (me.coreId == null) {
            return
        }

        me.getReference('error').text = '';
        me.setLocked(true);

        try {
            await client.set('Module', {update: {[me.coreId]: {settings: {licenseDenied: denied, license}}}});
            me.close();
            Object.keys(Neo.apps || {}).forEach(windowId => Neo.Main.reloadWindow({windowId}))
        } catch (e) {
            if (!me.isDestroyed) {
                notifyError(me, e);
                me.setLocked(false)
            }
        }
    }
}

export default Neo.setupClass(LicenseDialog);
