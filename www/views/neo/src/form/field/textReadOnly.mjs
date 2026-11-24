import Text from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';

/**
 * neo writes the input's `readonly` attribute through its vdom. On an update the main thread
 * sets the DOM property of the attribute's name (DeltaUpdates, voidAttributes), and the
 * property is `readOnly`, not `readonly`: a text field that becomes read-only after it is
 * mounted stays editable, and one that started read-only stays read-only.
 *
 * The camel-case key is not a void attribute, so it goes through setAttribute() and
 * removeAttribute(), which HTML treats case-insensitively. The lower-case key is removed so
 * the attribute of the first render goes away with it.
 */
Text.prototype.updateReadOnlyState = function() {
    delete this.getInputEl().readonly;
    this.changeInputElKey('readOnly', !this.editable || this.readOnly || null)
};
