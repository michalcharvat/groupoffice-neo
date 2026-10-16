import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import {t}       from '../Translate.mjs';

/** csvIndex of "not mapped" and of "fixed value" */
export const NOT_MAPPED = -2;
export const FIXED      = -1;

const empty = () => ({csvIndex: NOT_MAPPED, fixed: null});

/**
 * The column mapping of a CSV / Excel import (the field part of go.import.CsvMappingDialog):
 * a row per entity property with a column of the file, "Fixed value" (then a text) or
 * nothing. Properties with sub properties (e-mail addresses, addresses) are groups; a
 * "many" group has one block per item with add / remove.
 *
 * The mapping is the API's: {prop: {csvIndex, fixed}, group: [{sub: {csvIndex, fixed}}],
 * object: {sub: {csvIndex, fixed}}}. Native selects in the own vdom: there can be dozens.
 */
class MappingEditor extends Component {
    static config = {
        className: 'GO.import.MappingEditor',
        ntype    : 'go-import-mappingeditor',
        baseCls  : ['go-import-mapping'],
        _vdom    : {cn: []}
    }

    /** Entity/importCSVMapping goHeaders */
    goHeaders = {}
    /** columns of the file */
    csvHeaders = []
    /** {prop: {label, properties}} labels of the module (go.util.importFile options.fields / labels) */
    fields = {}
    /** properties with a preset value (not mapped) */
    skip = []
    /** current mapping */
    mapping = {}

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {change: me.onSelectChange, delegate: '.go-import-column', scope: me},
            {input : me.onFixedInput,   delegate: '.go-import-fixed',  scope: me},
            {click : me.onButtonClick,  delegate: '.go-import-button', scope: me}
        ])
    }

    /**
     * @param {Object} config {goHeaders, csvHeaders, fields, skip, mapping}
     */
    setData({goHeaders, csvHeaders, fields = {}, skip = [], mapping = {}}) {
        let me = this;

        me.goHeaders  = goHeaders || {};
        me.csvHeaders = csvHeaders || [];
        me.fields     = fields;
        me.skip       = skip;
        me.mapping    = structuredClone(mapping || {});
        me.renderMapping()
    }

    /**
     * @returns {Object} the mapping for Entity/import
     */
    getMapping() {
        return structuredClone(this.mapping)
    }

    /**
     * @protected
     */
    renderMapping() {
        let me = this;

        me.vdom.cn = Object.values(me.goHeaders)
            .filter(h => !me.skip.includes(h.name))
            .map(h => me.renderHeader(h, me.fields[h.name] || {}, [h.name], me.mapping));

        me.update()
    }

    /**
     * @param {Object} h goHeader
     * @param {Object} field label config of the module
     * @param {Array} path into the mapping
     * @param {Object} parent mapping object that holds h.name
     * @returns {Object} vdom
     * @protected
     */
    renderHeader(h, field, path, parent) {
        let me    = this,
            label = field.label || h.label || h.name;

        if (h.properties && !Array.isArray(h.properties) || h.grouped) {
            const props = Object.values(h.properties || {});

            if (!props.length) {
                return {removeDom: true}
            }

            if (h.many) {
                const items = Array.isArray(parent[h.name]) ? parent[h.name] : (parent[h.name] = []);

                return {cls: ['go-import-group'], cn: [
                    {tag: 'h4', cls: ['go-import-group-title'], text: label},
                    ...items.map((item, index) => ({cls: ['go-import-item'], cn: [
                        ...props.map(p => me.renderHeader(p, field.properties?.[p.name] || {}, [...path, index, p.name], item)),
                        me.button('remove', 'delete', t('Delete'), [...path, index])
                    ]})),
                    me.button('add', 'add', t('Add'), path, label)
                ]}
            }

            const object = parent[h.name] && typeof parent[h.name] === 'object' ? parent[h.name] : (parent[h.name] = {});

            return {cls: ['go-import-group'], cn: [
                {tag: 'h4', cls: ['go-import-group-title'], text: label},
                ...props.map(p => me.renderHeader(p, field.properties?.[p.name] || {}, [...path, p.name], object))
            ]}
        }

        const map     = parent[h.name] ??= empty(),
              key     = path.join('.'),
              current = Number(map.csvIndex ?? NOT_MAPPED);

        return {cls: ['go-import-row'], cn: [
            {tag: 'label', cls: ['go-import-label'], text: label, for: me.id + '__' + key},
            {tag: 'select', cls: ['go-import-column'], id: me.id + '__' + key, 'data-path': key, value: String(current), cn: [
                [NOT_MAPPED, ''],
                [FIXED, t('Fixed value')],
                ...me.csvHeaders.map((name, index) => [index, name || '(' + (index + 1) + ')'])
            ].map(([index, text]) => ({tag: 'option', value: String(index), text, selected: index === current || null}))},
            {tag: 'input', type: 'text', cls: ['go-import-fixed'], 'data-path': key, placeholder: t('Fixed value'),
                value: map.fixed ?? '', removeDom: current !== FIXED}
        ]}
    }

    /**
     * @param {String} action
     * @param {String} icon
     * @param {String} text
     * @param {Array} path
     * @param {String} [label]
     * @returns {Object} vdom
     */
    button(action, icon, text, path, label) {
        return {
            tag          : 'button',
            type         : 'button',
            cls          : ['go-import-button', 'go-import-' + action],
            title        : label ? text + ': ' + label : text,
            'data-action': action,
            'data-path'  : path.join('.'),
            cn           : [{tag: 'span', cls: ['go-icon'], text: icon}, ...action === 'add' ? [{tag: 'span', text}] : []]
        }
    }

    /**
     * @param {String} key 'emailAddresses.0.email'
     * @returns {Object|Array|undefined}
     */
    resolve(key) {
        return String(key).split('.').reduce((node, part) => node?.[part], this.mapping)
    }

    onSelectChange(data) {
        const key = data.path?.find(n => n.data?.path)?.data.path,
              map = key && this.resolve(key);

        if (map) {
            map.csvIndex = Number(data.value ?? data.target?.value);
            map.csvIndex !== FIXED && (map.fixed = null);
            this.renderMapping()
        }
    }

    onFixedInput(data) {
        const key = data.path?.find(n => n.data?.path)?.data.path,
              map = key && this.resolve(key);

        // no new render: the input keeps its caret
        map && (map.fixed = data.value ?? data.target?.value ?? '')
    }

    onButtonClick(data) {
        let me   = this,
            node = data.path?.find(n => n.data?.action),
            key  = node?.data.path;

        if (!key) {
            return
        }

        if (node.data.action === 'add') {
            const list = me.resolve(key);
            Array.isArray(list) && list.push({})
        } else {
            const parts = key.split('.'),
                  index = Number(parts.pop()),
                  list  = me.resolve(parts.join('.'));

            Array.isArray(list) && list.splice(index, 1)
        }

        me.renderMapping()
    }
}

export default Neo.setupClass(MappingEditor);
