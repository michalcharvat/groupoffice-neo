import Toolbar from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button  from '../../../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';

/**
 * A question with own buttons (GOUI win() with an icon, a text and a tbar), e.g.
 * "This event / This and future events / All events".
 *
 *     const value = await ChoiceDialog.ask({appName, windowId, title, icon: 'event_repeat', text,
 *         buttons: [{text: 'Cancel', value: null}, '->', {text: 'Send', value: 'send', primary: true}]});
 *
 * Resolves with the value of the pressed button, null when closed.
 */
class ChoiceDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.ChoiceDialog',
        cls         : ['go-cal-choice-dialog'],
        modal       : true,
        resizable   : false,
        headerConfig: headerTools('close'),
        wrapperStyle: {left: 'calc(50vw - 275px)', top: '25vh', width: '550px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {String|null} icon Material icon left of the text */
        icon   : null,
        /** @member {String} text trusted HTML (translations) */
        text   : '',
        /** @member {String|null} warning */
        warning: null,
        /** @member {Array} buttons {text, value, primary, hidden} or '->' */
        buttons: []
    }

    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            cls  : ['go-cal-choice-body'],
            vdom : {cn: [
                me.icon ? {tag: 'i', cls: ['go-icon', 'go-cal-choice-icon'], text: me.icon} : null,
                {cls: ['go-cal-choice-text'], cn: [
                    {html: me.text},
                    me.warning ? {cls: ['go-cal-choice-warning'], cn: [{tag: 'i', cls: ['go-icon', 'danger'], text: 'warning'}, {vtype: 'text', text: ' ' + me.warning}]} : null
                ].filter(Boolean)}
            ].filter(Boolean)}
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : me.buttons.filter(b => b === '->' || !b.hidden).map(b => b === '->' ? '->' : {
                module : Button,
                text   : b.text,
                ui     : b.primary ? 'primary' : 'ghost',
                handler: () => {
                    me.answer = b.value ?? null;
                    me.close()
                }
            })
        }]
    }

    /**
     * @param {Object} config
     * @returns {Promise<*>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(ChoiceDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(ChoiceDialog);
