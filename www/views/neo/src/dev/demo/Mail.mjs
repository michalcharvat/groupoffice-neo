import Button          from '../../button/Button.mjs';
import ModuleRegistry  from '../../ModuleRegistry.mjs';
import TextField       from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Page, {code, h3, output, p} from './Page.mjs';
import {mailto, mailtoUrl, showComposer} from '../../Mail.mjs';
import {notifyError}   from '../../Notify.mjs';
import {t}             from '../../Translate.mjs';

/**
 * Dev demo: showComposer() (src/Mail.mjs, ExtJS go.showComposer): any module writes
 * e-mail through it. With the e-mail module it opens the composer of that module (nothing
 * is sent until the user presses Send there); without it, or with the desktop composer
 * chosen in the e-mail settings, it hands a mailto: link to the desktop mail program.
 */
class MailDemo extends Page {
    static config = {
        className: 'GO.dev.demo.Mail',
        heading  : 'showComposer()'
    }

    pageItems() {
        const me        = this,
              hasModule = ModuleRegistry.getConfigs('showComposer').length > 0;

        return [
            p(t('Modules write e-mail with showComposer() from src/Mail.mjs. The e-mail module registers its composer (registry key showComposer); without it, or when the user chose the desktop composer in the e-mail settings, a mailto: link opens the desktop mail program.')),
            code(`import {showComposer} from '…/views/neo/src/Mail.mjs';

showComposer({appName, windowId, to: 'john@example.com', name: 'John Doe', subject, body});
showComposer({appName, windowId, values: {to: [{name, email}], cc, subject, body},
    links: [{entity: 'Contact', entityId: 5}]});`),
            p(hasModule ? t('The e-mail module is available: the composer opens. Nothing is sent until you press Send in it.') : t('The e-mail module is not available: showComposer() uses a mailto: link.')),
            {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'start'},
                style : {gap: '12px', maxWidth: '640px'},
                items : [
                    {module: TextField, reference: 'to', labelText: t('To'), labelPosition: 'inline', width: 400, value: 'john@example.com'},
                    {module: TextField, reference: 'subject', labelText: t('Subject'), labelPosition: 'inline', width: 400, value: t('Hello from the Dev module')}
                ]
            },
            h3(t('With the e-mail module')),
            {
                module : Button,
                ui     : 'primary',
                icon   : 'mail',
                text   : t('showComposer()'),
                style  : {alignSelf: 'start'},
                handler: () => me.compose().catch(e => notifyError(me, e))
            },
            h3(t('Without the e-mail module')),
            p(t('This is what showComposer() does without the e-mail module: mailtoUrl() builds the link, mailto() opens it in the desktop mail program (in a new window target, so the page is not unloaded).')),
            {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'center'},
                style : {gap: '8px'},
                items : [{
                    module : Button,
                    ui     : 'secondary',
                    text   : 'mailtoUrl()',
                    handler: () => me.log(mailtoUrl(me.message()))
                }, {
                    module : Button,
                    ui     : 'secondary',
                    icon   : 'open_in_new',
                    text   : t('Open in the desktop mail program'),
                    handler: () => mailto(me, me.message()).then(opened => me.log(`mailto(): ${opened ? 'opened' : 'blocked by the browser'}`)).catch(e => notifyError(me, e))
                }]
            },
            output()
        ]
    }

    /**
     * @returns {Object} {to, name, subject, body} from the fields
     */
    message() {
        return {
            to     : this.getReference('to').value || '',
            name   : 'John Doe',
            subject: this.getReference('subject').value || '',
            body   : t('This message was started from the Dev module.')
        }
    }

    async compose() {
        const me       = this,
              composer = await showComposer({appName: me.appName, windowId: me.windowId, ...me.message()});
        me.log(composer ? `showComposer(): composer ${composer.id} opened` : 'showComposer(): mailto: link used')
    }
}

export default Neo.setupClass(MailDemo);
