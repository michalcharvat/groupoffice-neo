import Button    from '../../node_modules/neo.mjs/src/button/Base.mjs';
import Container from '../../node_modules/neo.mjs/src/form/Container.mjs';

/**
 * A `<button>` without a type is a submit button. neo's plain button sets `type="button"`, but
 * its subclasses with their own vdom don't (tab headers, table headers, the split button). In a
 * form (FormWindow) a click on such a button runs the browser's form validation ("An invalid form
 * control … is not focusable" for a required field on a hidden tab), and Enter in an input
 * "clicks" the first of them (the first tab header).
 *
 * Every button.Base root that is a `<button>` gets `type="button"` unless it has a type, and forms
 * get `novalidate`: GO validates its fields itself, Enter submits through submitOnEnter.mjs.
 * syncNativeDisabledState() runs whenever the root tag is set (construction, url/route changes).
 */
const syncNativeDisabledState = Button.prototype.syncNativeDisabledState;

Button.prototype.syncNativeDisabledState = function() {
    syncNativeDisabledState.call(this);

    const vdomRoot = this.getVdomRoot();

    if (vdomRoot.tag === 'button') {
        vdomRoot.type ??= 'button'
    } else if (vdomRoot.type === 'button') {
        delete vdomRoot.type // a url / route link: type on <a> is a media type
    }
};

const construct = Container.prototype.construct;

Container.prototype.construct = function(config) {
    construct.call(this, config);

    this.vdom.tag === 'form' && (this.vdom.novalidate = true)
};
