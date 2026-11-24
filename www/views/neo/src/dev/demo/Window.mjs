import Button          from '../../button/Button.mjs';
import Component       from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import ConfirmDialog   from '../../view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../view/Dialog.mjs';
import FormContainer   from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import HtmlField       from '../../form/field/HtmlField.mjs';
import RecipientsField from '../../form/field/RecipientsField.mjs';
import TextField       from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import TextPrompt      from '../../view/TextPrompt.mjs';
import Toolbar         from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Page, {h3, output, p} from './Page.mjs';
import {notify, notifyError} from '../../Notify.mjs';
import {t}             from '../../Translate.mjs';

/**
 * Centred position and size of a dialog (no animateTarget: .neo-floating parks it off-screen)
 * @param {Number} width px
 * @param {Number} height px
 * @returns {Object} wrapperStyle
 */
function centred(width, height) {
    return {left: `calc(50vw - ${width / 2}px)`, top: `calc(50vh - ${height / 2}px)`, width: width + 'px', height: height + 'px'}
}

/**
 * Dev demo: GOUI Window (goui-docs Window.ts) with GO.view.Dialog: plain, modal,
 * draggable / resizable / maximizable, a dialog with a form; and the question dialogs
 * GO.view.ConfirmDialog.ask() and GO.view.TextPrompt.ask().
 */
class Window extends Page {
    static config = {
        className: 'GO.dev.demo.Window',
        heading  : t('Window')
    }

    pageItems() {
        const me = this;

        /**
         * @param {String} text
         * @param {Function} handler
         * @returns {Object}
         */
        const button = (text, handler) => ({module: Button, ui: 'secondary', text, handler: () => {
            try {
                const result = handler();
                result?.catch?.(e => notifyError(me, e))
            } catch (e) {
                notifyError(me, e)
            }
        }});

        return [
            p(t('GO.view.Dialog is the base of every GO window: GOUI window tools in the header (pop out, maximize, close), Escape closes, modal dialogs mask the page. Subclasses add their items; position and size go in wrapperStyle.')),
            {
                module: Toolbar,
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                style : {padding: 0, gap: '8px'},
                items : [
                    button(t('Basic window'), () => me.openWindow({
                        title       : t('Basic window'),
                        modal       : false,
                        draggable   : false,
                        resizable   : false,
                        headerConfig: headerTools('close'),
                        wrapperStyle: centred(400, 200),
                        text        : t("I'm a basic window. No features enabled.")
                    })),
                    button(t('Modal window'), () => me.openWindow({
                        title       : t('Modal window'),
                        modal       : true,
                        draggable   : false,
                        resizable   : false,
                        headerConfig: headerTools('close'),
                        wrapperStyle: centred(400, 200),
                        text        : t("I'm a modal window. You have to close me first.")
                    })),
                    button(t('Draggable and resizable window'), () => me.openWindow({
                        title       : t('Draggable window'),
                        modal       : false,
                        draggable   : true,
                        resizable   : true,
                        wrapperStyle: centred(400, 220),
                        text        : t("I'm a draggable window. Drag me with the header, resize me on the edges or corners, maximize or pop me out with the header tools.")
                    })),
                    button(t('Dialog with form'), () => me.openFormWindow())
                ]
            },
            h3(t('Questions')),
            p(t('ConfirmDialog.ask() and TextPrompt.ask() return a promise with the answer (null / false when cancelled). Errors are shown with notifyError(), which also logs them to the console.')),
            {
                module: Toolbar,
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                style : {padding: 0, gap: '8px'},
                items : [
                    button(t('Prompt'), async () => {
                        const name = await TextPrompt.ask({appName: me.appName, windowId: me.windowId, title: t('Enter your name'), label: t('Name')});
                        me.log(name === null ? 'prompt: cancelled' : `prompt: Hi ${name}`)
                    }),
                    button(t('Confirm'), async () => {
                        const ok = await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId, message: t('Are you sure you want to do this?')});
                        me.log(`confirm: ${ok}`)
                    }),
                    // notifyError() also logs the error to the console: the demo shows only the toast
                    button(t('Error'), () => notify(me, t('Something went wrong (demo error)'), {title: t('Error'), iconCls: 'fa fa-triangle-exclamation', closable: true}))
                ]
            },
            output()
        ]
    }

    /**
     * @param {Object} config Dialog config plus `text` for its body
     * @returns {GO.view.Dialog}
     */
    openWindow({text, ...config}) {
        const me = this;

        return Neo.create(Dialog, {
            appName : me.appName,
            windowId: me.windowId,
            ...config,
            items   : [{module: Component, style: {padding: '16px'}, text}]
        })
    }

    openFormWindow() {
        const me = this;

        const dialog = Neo.create(Dialog, {
            appName        : me.appName,
            windowId       : me.windowId,
            title          : t('Dialog with form'),
            modal          : false,
            wrapperStyle   : centred(800, 560),
            containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
            items          : [{
                module   : FormContainer,
                reference: 'form',
                flex     : 1,
                layout   : {ntype: 'vbox', align: 'stretch'},
                style    : {gap: '16px', padding: '16px', overflow: 'auto'},
                items    : [{
                    module       : TextField,
                    name         : 'subject',
                    labelText    : t('Subject'),
                    labelPosition: 'inline',
                    required     : true,
                    flex         : 'none'
                }, {
                    module   : RecipientsField,
                    name     : 'to',
                    labelText: t('To'),
                    flex     : 'none'
                }, {
                    module   : HtmlField,
                    name     : 'body',
                    labelText: t('Body'),
                    flex     : 1
                }]
            }, {
                module: Toolbar,
                cls   : ['go-dialog-buttons'],
                flex  : 'none',
                items : [{
                    module : Button,
                    icon   : 'attach_file',
                    text   : t('Attach files'),
                    handler: () => me.log(t('Attachments are not part of this demo (see the Upload page)'))
                }, '->', {
                    module : Button,
                    ui     : 'primary',
                    text   : t('Send'),
                    handler: () => me.onSubmitForm(dialog).catch(e => notifyError(me, e))
                }]
            }]
        });
    }

    /**
     * Validates the form and logs its values (nothing is sent)
     * @param {GO.view.Dialog} dialog
     */
    async onSubmitForm(dialog) {
        const form = dialog.getReference('form');

        if (!await form.validate()) {
            return
        }

        this.log('form values: ' + JSON.stringify(await form.getValues()));
        dialog.close()
    }
}

export default Neo.setupClass(Window);
