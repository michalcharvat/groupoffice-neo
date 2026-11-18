import Text from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';

/**
 * neo treats autoComplete as a Boolean: any truthy value removes the attribute, so
 * autoComplete: 'new-password' / 'current-password' never reaches the input (browsers
 * then warn and offer saved passwords in the wrong fields). A string is written as is;
 * true / false keep neo's behaviour.
 */
Text.prototype.afterSetAutoComplete = function(value) {
    this.changeInputElKey('autocomplete', typeof value === 'string' ? value : (value ? null : 'no'))
};
