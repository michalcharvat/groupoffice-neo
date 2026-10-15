import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import HiddenField   from '../../node_modules/neo.mjs/src/form/field/Hidden.mjs';
import Button        from '../button/Button.mjs';
import UploadButton  from '../component/UploadButton.mjs';
import ColorField    from '../form/field/ColorField.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import client        from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {setBodyStyle} from '../Preferences.mjs';
import {t}           from '../Translate.mjs';
import SettingsPanel from './SettingsPanel.mjs';
import {hint}        from './fields.mjs';

/** [setting suffix, label, CSS variable, default, hint] (Settings::printCssVars()) */
const COLORS = () => [
    ['primary',   t('Primary color'),   '--fg-main',     '1652A1', t('Header bar, Input focus, Active elements, Links')],
    ['secondary', t('Secondary color'), '--c-primary',   '00B0AD', t('Primary actions, Save buttons')],
    ['tertiary',  t('Tertiary color'),  '--c-secondary', 'F3DB00', t('Active tab indication')],
    ['accent',    t('Accent color'),    '--c-accent',    'FF7200', t('Badges, warnings')]
];

/**
 * "Appearance" card of System settings (go.systemsettings.AppearancePanel): logo and
 * colours of the light and the dark scheme. A colour shows in all windows while it is
 * edited (like ExtJS); closing without saving takes the preview back.
 */
class AppearancePanel extends SettingsPanel {
    static config = {
        className   : 'GO.systemsettings.AppearancePanel',
        reloadOnSave: true
    }

    /**
     * CSS variables set as preview
     * @member {Set<String>} previewed
     */
    previewed = new Set()

    createItems() {
        return [{
            ntype : 'container',
            cls   : ['go-systemsettings-columns'],
            flex  : 'none',
            layout: null,
            items : [this.createScheme(t('Light'), 'logoId', 'Color', 'light'), this.createScheme(t('Dark'), 'logoIdDark', 'Dark', 'dark')]
        }]
    }

    /**
     * @param {String} legend
     * @param {String} logoKey  setting of the logo blob
     * @param {String} suffix   colour settings: primaryColor / primaryDark, ...
     * @param {String} scheme   'light' or 'dark' (the hints show once, with light)
     * @returns {Object}
     * @protected
     */
    createScheme(legend, logoKey, suffix, scheme) {
        let me = this;

        return fieldset(legend, [
            me.createLogo(logoKey),
            ...COLORS().flatMap(([type, label, cssVar, defaultColor, text]) => [{
                module         : ColorField,
                name           : `settings.${type}${suffix}`,
                labelText      : label,
                placeholderText: defaultColor,
                // typing only: loading the values must not preview them
                listeners      : {userChange: ({component}) => me.preview(cssVar, component, scheme)}
            }, ...scheme === 'light' ? [hint(text)] : []])
        ])
    }

    /**
     * Logo (go.form.FileField): preview, upload, reset; the value is the blob id
     * @param {String} key
     * @returns {Object}
     * @protected
     */
    createLogo(key) {
        let me = this;

        return {
            ntype : 'container',
            cls   : ['go-systemsettings-logo'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : HiddenField,
                name     : 'settings.' + key,
                reference: key,
                listeners: {change: () => me.syncLogo(key)}
            }, {
                ntype    : 'component',
                reference: key + 'Image',
                cls      : ['go-systemsettings-logo-image'],
                flex     : 1
            }, {
                module    : UploadButton,
                multiple  : false,
                buttonText: t('Upload'),
                listeners : {files: ({files}) => me.uploadLogo(key, files[0])}
            }, {
                module   : Button,
                icon     : 'delete',
                reference: key + 'Reset',
                tooltip  : t('Reset'),
                disabled : true,
                handler  : () => me.getReference(key).value = null
            }]
        }
    }

    async onSettingsLoad(module) {
        await super.onSettingsLoad(module);
        ['logoId', 'logoIdDark'].forEach(key => this.syncLogo(key))
    }

    /**
     * @param {String} key
     * @param {File} file
     * @protected
     */
    async uploadLogo(key, file) {
        let me = this;

        if (!file) {
            return
        }

        if (!String(file.type).startsWith('image/')) {
            notifyError(me, new Error(t('Please select an image')));
            return
        }

        try {
            const {blobId} = await client.upload(file);
            me.isDestroyed || (me.getReference(key).value = blobId)
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Shows the logo of the field's blob
     * @param {String} key
     * @protected
     */
    syncLogo(key) {
        let me     = this,
            blobId = me.getReference(key)?.value,
            image  = me.getReference(key + 'Image');

        if (!image) {
            return
        }

        image.style = blobId ? {backgroundImage: `url("${client.apiUrl}download.php?blob=${encodeURIComponent(blobId)}")`} : {};
        me.getReference(key + 'Reset').disabled = !blobId
    }

    /**
     * Shows a colour while it is edited, in the windows that show its colour scheme
     * @param {String} cssVar
     * @param {GO.form.field.ColorField} field
     * @param {String} scheme 'light' or 'dark'
     * @protected
     */
    preview(cssVar, field, scheme) {
        this.previewed.add(cssVar);
        setBodyStyle({[cssVar]: field.color}, scheme)
    }

    destroy(...args) {
        // saved: the windows reload with the new colours; cancelled: the preview goes
        const props = Object.fromEntries([...this.previewed].map(name => [name, null]));
        this.previewed.size && setBodyStyle(props);
        super.destroy(...args)
    }
}

export default Neo.setupClass(AppearancePanel);
