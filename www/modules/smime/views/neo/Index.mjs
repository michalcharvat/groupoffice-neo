import ModuleRegistry   from '../../../../views/neo/src/ModuleRegistry.mjs';
import BoolCheckBox     from '../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {t, LEVEL_WRITE} from './api.mjs';
import CertificatesPanel from './view/CertificatesPanel.mjs';
import composerPlugin   from './view/composerPlugin.mjs';

/**
 * S/MIME (legacy module www/modules/smime, ExtJS PluginAccountDialog, PluginEmailComposer,
 * PluginMessagePanel, AttachmentContextMenuOverride, CertificateDetailWindow, PublicCertsGrid):
 * the e-mail client's extension points (docs/neo-email-module.md). The backend stays the
 * legacy routes smime/certificate/* and smime/publicCertificate/* and the smime listeners
 * on the e-mail controllers (EventHandlers.php).
 */
ModuleRegistry.register({
    package   : 'legacy',
    name      : 'smime',
    title     : t('SMIME support'),
    capability: 'go:legacy:smime',

    // account dialog: "Always sign messages" and the account's PKCS#12 certificates
    emailAccountDialogCards: {
        id    : 'smime',
        header: {text: t('SMIME settings')},
        order : 70,
        // certificates belong to a saved account
        isAvailable: account => !!account?.id,
        items: () => [{
            module    : BoolCheckBox,
            name      : 'always_sign',
            valueLabel: t('Always sign messages'),
            flex      : 'none',
            disabled  : true
        }, {
            module: CertificatesPanel,
            flex  : 1
        }],
        load: async ({account, dialog, card}) => {
            const panel  = card.down({className: 'GO.smime.CertificatesPanel'}),
                  always = card.down({name: 'always_sign'}),
                  level  = dialog.level,
                  // signing needs a certificate, changing the setting write permission (ExtJS: a certificate)
                  update = ({count}) => always && !always.isDestroyed && (always.disabled = !count || level < LEVEL_WRITE);

            // load runs again after every save of the dialog
            panel.smimeListening || panel.on('change', update);
            panel.smimeListening = true;
            await panel.setAccount(account?.id || null, level)
        }
    },

    // composer: Sign / Encrypt in the options menu, the certificate password before sending
    emailComposerPlugins: composerPlugin
});
