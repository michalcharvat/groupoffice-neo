import {resolveCallback} from '../../node_modules/neo.mjs/src/util/Function.mjs';

/**
 * Enter in a form submits it, as the hidden submit button of the ExtJS go.form.Dialog and the
 * <form> of GOUI did. A neo form does not submit natively (form.Container renders
 * onsubmit="return false;" and the app runs in a worker), so a form binds Enter with `keys`:
 *
 *     keys: {Enter: submitOnEnter('submit')}      // a method of the component itself
 *     keys: {Enter: submitOnEnter('up.onLogin')}  // a method of a parent
 *
 * A plain `keys: {Enter: 'up.onLogin'}` does nothing: neo's KeyNavigation looks the string up
 * on the component as it is and does not search the parents for 'up.' names.
 *
 * Enter submits only when isSubmitEnter() says so.
 *
 * @param {Function|String} fn the submit function, or its name (resolved like a button handler)
 * @returns {Function} a `keys` handler
 */
export function submitOnEnter(fn) {
    return function(data, component) {
        if (isSubmitEnter(data, component)) {
            const callback = resolveCallback(fn, component);

            callback.fn?.call(callback.scope)
        }
    }
}

/**
 * Enter submits when it is pressed without modifiers and outside an IME composition in an input
 * (not in a textarea, rich text, a button or a link, which use Enter themselves) and no component
 * between the input and the form takes Enter for itself:
 * - a component with its own Enter key binding (a picker opens its list on Enter)
 * - a component whose ownsEnterKey(data) returns true: chips and autocomplete fields turn the
 *   typed text into a value on Enter, the link bar of the HTML field applies the link, the
 *   colour input opens its chooser, and a field that takes its value on `change` (DurationField)
 *   would be saved with the old value (the change arrives after the keydown)
 *
 * @param {Object} data keydown event data
 * @param {Neo.component.Base} form the component that binds Enter
 * @returns {Boolean}
 */
export function isSubmitEnter(data, form) {
    const {altKey, ctrlKey, keyCode, metaKey, shiftKey, target} = data;

    // keyCode 229: the Enter confirms an IME composition (neo sends no isComposing)
    if (altKey || ctrlKey || metaKey || shiftKey || keyCode === 229 || target?.tagName !== 'input' || target.isContentEditable) {
        return false
    }

    for (const {id} of data.path || []) {
        const component = id && Neo.getComponent(id);

        if (!component) {
            continue
        }

        if (component === form) {
            return true
        }

        if (component.ownsEnterKey?.(data) || hasEnterKey(component)) {
            return false
        }
    }

    return true
}

/**
 * @param {Neo.component.Base} component
 * @returns {Boolean} the component binds Enter in its `keys` config
 */
function hasEnterKey(component) {
    const keys = component.keys?.keys;

    return Array.isArray(keys) && keys.some(({key}) => key?.toUpperCase() === 'ENTER')
}
