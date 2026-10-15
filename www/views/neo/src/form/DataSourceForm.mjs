import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import './nestedFields.mjs';
import client        from '../jmap/Client.mjs';
import {t}           from '../Translate.mjs';

/**
 * A form that loads and saves one JMAP entity (GOUI DataSourceForm).
 *
 *     form.create({noteBookId: 3});  // new entity, initial values
 *     await form.load(5);            // Note/get
 *     await form.submit();           // Note/set: create, or update with the modified fields only
 *
 * Fields bind by name (formGroup for nested properties, e.g. formGroup 'customFields').
 * Values without a field are kept and sent on create (defaults like noteBookId
 * a subclass does not show).
 *
 * Events:
 * - beforeload {data}         entity fetched, not set on the fields yet
 * - load       {data}         values set (also after create())
 * - loaderror  {error}
 * - beforesave {data, isNew, cancel}  data is mutable, set cancel = true to stop
 * - save       {data, isNew}  data: the full entity after saving
 * - saveerror  {error, validationErrors}  validationErrors are shown on the fields
 * - invalid    {}           client-side validation failed
 */
class DataSourceForm extends FormContainer {
    static config = {
        className: 'GO.form.DataSourceForm',
        /**
         * JMAP entity name, e.g. 'Note'
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Properties to fetch in load(), null for all
         * @member {String[]|null} properties=null
         */
        properties: null
    }

    /**
     * Id of the loaded entity, null while creating
     * @member {String|null} currentId=null
     */
    currentId = null

    /**
     * Last loaded or saved entity / initial values
     * @member {Object} entityData={}
     */
    entityData = {}

    /**
     * Submit values right after load()/create(): path → value, for isModified()
     * @member {Object} originalValues={}
     */
    originalValues = {}

    /**
     * @returns {Boolean}
     */
    get isNew() {
        return !this.currentId
    }

    /**
     * Prepare the form for a new entity
     * @param {Object} [values] initial values
     */
    async create(values = {}) {
        let me = this;

        me.currentId = null;
        me.fire('beforeload', {data: values});
        await me.applyData(values);
        me.fire('load', {data: values})
    }

    /**
     * Loads an entity into the form
     * @param {String|Number} id
     * @returns {Promise<Object|null>} the entity, null on failure (loaderror fired)
     */
    async load(id) {
        let me = this;

        me.isLoading = t('Loading...');

        try {
            const [entity] = await client.get(me.entity, [String(id)], me.properties || undefined);

            if (!entity) {
                throw new Error(t('Not found'))
            }

            me.currentId = entity.id;
            me.fire('beforeload', {data: entity});
            await me.applyData(entity);
            me.fire('load', {data: entity});

            return entity
        } catch (error) {
            me.isDestroyed || me.fire('loaderror', {error});
            return null
        } finally {
            if (!me.isDestroyed) {
                me.isLoading = false
            }
        }
    }

    /**
     * Sets the values and takes them as the unmodified state
     * @param {Object} data
     * @protected
     */
    async applyData(data) {
        let me = this;

        me.entityData = data;
        await me.reset(data);
        await me.clearServerErrors();
        me.originalValues = await me.collectValues()
    }

    /**
     * Current submit values by field path
     * @returns {Promise<Object>} path → value
     * @protected
     */
    async collectValues() {
        const values = {};

        (await this.getFields()).forEach(field => {
            if (field.name) {
                values[this.getFieldPath(field)] = DataSourceForm.fieldValue(field)
            }
        });

        return values
    }

    /**
     * Submit value of a field. An empty text field is '' like in GOUI: neo
     * returns null, which non-nullable string properties refuse.
     * @param {Neo.form.field.Base} field
     * @returns {*}
     */
    static fieldValue(field) {
        const value = field.getSubmitValue();

        return value == null && ['textfield', 'textarea', 'emailfield', 'passwordfield'].includes(field.ntype) ? '' : value
    }

    /**
     * All values, nested like the entity
     * @returns {Promise<Object>}
     */
    async getEntityValues() {
        const values = {};

        Object.entries(await this.collectValues()).forEach(([path, value]) => {
            DataSourceForm.setPath(values, path, value)
        });

        return values
    }

    /**
     * @param {*} a
     * @param {*} b
     * @returns {Boolean}
     */
    static isSameValue(a, b) {
        const empty = v => v === null || v === undefined || v === '',
              // a map entry set to null means "not set" (e.g. acl {groupId: null} removes the group)
              clean = v => Neo.typeOf(v) === 'Object'
                  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined))
                  : v;

        // JMAP ids come as numbers or strings: a combo that resolved its record returns "65" for 65
        const scalar = v => typeof v === 'number' || typeof v === 'string';

        return (empty(a) && empty(b)) || (scalar(a) && scalar(b) && String(a) === String(b)) || Neo.isEqual(clean(a), clean(b))
    }

    /**
     * Takes a field value that a field set by itself after loading (e.g. a new
     * entity's default ACL) as unmodified
     * @param {String} path field name
     * @param {*} value
     */
    setOriginalValue(path, value) {
        this.originalValues = {...this.originalValues, [path]: value}
    }

    /**
     * Modified values, nested like the entity ({customFields: {color: 'red'}})
     * @returns {Promise<Object>}
     */
    async getModified() {
        let me       = this,
            values   = await me.collectValues(),
            modified = {};

        Object.entries(values).forEach(([path, value]) => {
            if (!DataSourceForm.isSameValue(value, me.originalValues[path])) {
                DataSourceForm.setPath(modified, path, value)
            }
        });

        return modified
    }

    /**
     * @returns {Promise<Boolean>}
     */
    async isModified() {
        return Object.keys(await this.getModified()).length > 0
    }

    /**
     * @param {Object} target
     * @param {String} path 'a.b.c'
     * @param {*} value
     */
    static setPath(target, path, value) {
        const keys = path.split('.'),
              last = keys.pop();

        keys.forEach(key => {
            target = target[key] ??= {}
        });

        target[last] = value
    }

    /**
     * Validates and saves. Create sends all values, update only the modified ones.
     * @returns {Promise<Object|false>} the saved entity, false when invalid, cancelled or failed
     */
    async submit() {
        let me = this;

        await me.clearServerErrors();

        if (!await me.validate()) {
            me.fire('invalid', {});
            return false
        }

        const isNew = me.isNew;
        let data;

        if (isNew) {
            // values without a field (defaults) + the field values
            const fieldValues = await me.getEntityValues();
            data = {...me.entityData, ...fieldValues};
            delete data.id
        } else {
            data = await me.getModified()
        }

        const event = {data, isNew, cancel: false};
        me.fire('beforesave', event);

        if (event.cancel) {
            return false
        }

        try {
            let id = me.currentId;

            // nothing changed: nothing to send
            if (isNew || Object.keys(event.data).length) {
                const response = await client.call(me.entity + '/set', isNew
                        ? {create: {new: event.data}}
                        : {update: {[id]: event.data}}),
                      error    = isNew ? response.notCreated?.new : response.notUpdated?.[id];

                if (error) {
                    throw Object.assign(new Error(DataSourceForm.describeError(error)), {setError: error})
                }

                isNew && (id = response.created.new.id)
            }

            const [entity] = await client.get(me.entity, [id], me.properties || undefined);

            if (me.isDestroyed) {
                return entity
            }

            me.currentId = id;
            await me.applyData(entity || {...me.entityData, ...event.data, id});
            me.fire('save', {data: me.entityData, isNew});

            return me.entityData
        } catch (error) {
            if (!me.isDestroyed) {
                const validationErrors = error.setError?.validationErrors || null;

                validationErrors && await me.showServerErrors(validationErrors);
                me.fire('saveerror', {error, validationErrors})
            }
            return false
        }
    }

    /**
     * @param {Object} error JMAP SetError
     * @returns {String}
     */
    static describeError(error) {
        if (error.validationErrors) {
            return t('You have errors in your form. The invalid fields are marked.')
        }

        return error.description || error.type || t('Error')
    }

    /**
     * Marks the fields with the server's validation errors
     * @param {Object} validationErrors {property: {code, description}}
     * @returns {Promise<String[]>} errors without a field ("property: description")
     */
    async showServerErrors(validationErrors) {
        let me       = this,
            unmapped = [],
            fields   = await me.getFields();

        me.serverErrorFields = [];

        Object.entries(validationErrors).forEach(([property, error]) => {
            const field       = fields.find(f => f.name && me.getFieldPath(f) === property),
                  description = error.description || error.code || t('Error');

            if (field && 'validator' in field) {
                // every validate() recomputes the error, so the server error goes in as a
                // validator that holds until the value changes
                const {validator} = field,
                      value       = field.value;

                field.goServerError = {validator};
                field.validator     = f => Neo.isEqual(f.value, value) ? description : (typeof validator === 'function' ? validator.call(f, f) : true);
                field.validate(false);
                me.serverErrorFields.push(field)
            } else {
                unmapped.push(property + ': ' + description)
            }
        });

        me.unmappedErrors = unmapped;

        return unmapped
    }

    /**
     * @protected
     */
    async clearServerErrors() {
        (this.serverErrorFields || []).forEach(field => {
            if (!field.isDestroyed && field.goServerError) {
                field.validator = field.goServerError.validator;
                delete field.goServerError
            }
        });

        this.serverErrorFields = [];
        this.unmappedErrors    = []
    }

    /**
     * Client-side validation, GO's required text
     * @returns {Promise<Boolean>}
     */
    async validate() {
        (await this.getFields()).forEach(field => {
            if ('errorTextRequired' in field && field.errorTextRequired === 'Required') {
                field.errorTextRequired = t('Required field')
            }
        });

        return super.validate()
    }

    /**
     * First invalid field, e.g. to show its tab and focus it
     * @returns {Promise<Neo.form.field.Base|null>}
     */
    async findFirstInvalid() {
        // fields with a server error first
        const serverField = (this.serverErrorFields || []).find(field => !field.isDestroyed && !field.isValid());

        return serverField || (await this.getFields()).find(field => !field.isValid()) || null
    }
}

export default Neo.setupClass(DataSourceForm);
