import Button      from '../../button/Button.mjs';
import Page, {code, h3, p} from './Page.mjs';
import {t}         from '../../Translate.mjs';

/**
 * Dev demo: GOUI Patching (goui-docs Patching.ts). GOUI patches a component prototype
 * with Button.patch(fn). neo applies `Neo.overwrites` (configs and methods by class
 * name) when a class is set up (Neo.setupClass()), so an overwrite must exist before
 * the class module is imported. Live: an overwrite for a class this page sets up on
 * the click.
 */
class Patching extends Page {
    static config = {
        className: 'GO.dev.demo.Patching',
        heading  : t('Patching')
    }

    pageItems() {
        const me = this;

        return [
            p(t('neo changes classes from outside through Neo.overwrites: an object by class name with configs and methods. Neo.setupClass() merges it into the class while it sets the class up, so the overwrite has to be defined before the class file is imported (in an overwrites file the app imports first). A method in the overwrite replaces the class method; the original stays callable through this.constructor.overwrittenMethods.')),
            code(`// overwrites.mjs, imported before the classes it changes
Neo.overwrites = Neo.merge(Neo.overwrites || {}, {
    GO: {button: {Button: {
        ui: 'secondary',                          // new default config
        onClick(data) {                           // replaces the method
            console.warn('Override click handler called', this);
            this.constructor.overwrittenMethods.onClick.call(this, data)
        }
    }}}
});`),
            p(t('For a change in one place prefer a subclass (class MyButton extends Button). A GO class that already ran Neo.setupClass() is not changed by a later overwrite.')),
            h3(t('Try it')),
            p(t('The button below defines an overwrite for GO.dev.demo.PatchedButton, then sets that class up and adds a button of it: the overwrite makes it primary and changes its text.')),
            {
                ntype    : 'container',
                reference: 'target',
                layout   : {ntype: 'hbox', align: 'center'},
                style    : {gap: '8px'},
                items    : [{
                    module : Button,
                    ui     : 'secondary',
                    text   : t('Create a patched button'),
                    handler: data => {
                        data.component.disabled = true;
                        me.addPatchedButton()
                    }
                }]
            }
        ]
    }

    addPatchedButton() {
        const ns = Neo.ns('GO.dev.demo', true, Neo.overwrites || (Neo.overwrites = {}));

        ns.PatchedButton = {
            ui  : 'primary',
            text: t('I am patched')
        };

        class PatchedButton extends Button {
            static config = {
                className: 'GO.dev.demo.PatchedButton',
                text     : 'Not patched'
            }
        }

        this.getReference('target').add({module: Neo.setupClass(PatchedButton)})
    }
}

export default Neo.setupClass(Patching);
