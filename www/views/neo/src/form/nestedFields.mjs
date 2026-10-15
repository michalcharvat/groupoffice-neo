import BaseField        from '../../node_modules/neo.mjs/src/form/field/Base.mjs';
import ComponentManager from '../../node_modules/neo.mjs/src/manager/Component.mjs';
import FormContainer    from '../../node_modules/neo.mjs/src/form/Container.mjs';

/**
 * A field inside a field belongs to that field.
 *
 * neo's form.Container collects every field below it. GO's composite fields
 * (ContainerField, ArrayField, their rows) hold child fields of their own and give
 * the form one value for all of them, so a form must not see those children.
 * This module patches Neo.form.Container#getFields() / getField() once: the walk
 * stops at a field (a Neo.form.field.Base or a component with isContainerField).
 * Imported by GO.form.DataSourceForm and the composite fields.
 */

/**
 * @param {Neo.component.Base} component
 * @returns {Boolean}
 */
export function isFormField(component) {
    return component instanceof BaseField || component?.isContainerField === true
}

/**
 * Direct children in their order in `items` (rows of an ArrayField), others after them
 * @param {Neo.component.Base} component
 * @returns {Neo.component.Base[]}
 */
function children(component) {
    const list  = ComponentManager.getDirectChildren(component.id),
          items = Array.isArray(component.items) ? component.items : [],
          index = child => {
              const i = items.indexOf(child);
              return i === -1 ? items.length : i
          };

    return items.length ? list.sort((a, b) => index(a) - index(b)) : list
}

/**
 * Fields below a container, not descending into fields
 * @param {Neo.component.Base} container
 * @returns {Neo.component.Base[]}
 */
export function collectFields(container) {
    const fields = [],
          walk   = component => children(component).forEach(child => {
              isFormField(child) ? fields.push(child) : walk(child)
          });

    walk(container);

    return fields
}

const proto = FormContainer.prototype;

if (!proto.goNestedFields) {
    proto.goNestedFields = true;

    proto.getFields = async function() {
        await this.loadModules();
        return collectFields(this)
    };

    proto.getField = async function(name) {
        await this.loadModules();
        return collectFields(this).find(field => field.name === name || field.id === name) || null
    };

    /*
     * setValues() wraps each field's value as {value}. neo also walks into an object or
     * array that is a field's whole value and wraps its leaves too ({street: {value: …}}):
     * a field path takes its value as it is.
     */
    FormContainer.adjustTreeLeaves = function adjustTreeLeaves(values = {}, configName, fieldPaths, currentPath = '') {
        Object.entries(values).forEach(([key, value]) => {
            const path = currentPath === '' ? key : `${currentPath}.${key}`,
                  type = Neo.typeOf(value);

            if (fieldPaths.includes(path)) {
                values[key] = key === configName ? value : {[configName]: value};
                return
            }

            if (type === 'Object') {
                adjustTreeLeaves(value, configName, fieldPaths, path)
            } else if (type !== 'Array') {
                values[key] = key === configName ? value : {[configName]: value}
            }
        })
    }
}
