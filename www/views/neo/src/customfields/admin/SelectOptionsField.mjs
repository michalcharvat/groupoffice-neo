import Field       from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import {t}         from '../../Translate.mjs';
import OptionDialog from './OptionDialog.mjs';

let keySeed = 0;

/**
 * The options of a Select or MultiSelect custom field as one form field
 * (`dataType.options`; go.customfields.type.SelectOptionsTree, MultiSelectDialog's FormGroup).
 *
 * Select (default): a tree. Each option has a checkbox (enabled: unchecked options stay
 * on the records but can't be chosen), edit (text, colours, render mode), add child,
 * move up / down and delete. MultiSelect (`flat: true`): a list of texts.
 *
 * The value is the API's: [{id, text, enabled, foregroundColor, backgroundColor,
 * renderMode, children}] or flat [{id, text, sortOrder}]. A new option has id null.
 * The whole list is this field's vdom (fields inside would end up in the form values).
 */
class SelectOptionsField extends Field {
    static config = {
        className: 'GO.customfields.admin.SelectOptionsField',
        ntype    : 'go-cf-selectoptions',
        baseCls  : ['go-cf-selectoptions'],
        /**
         * A flat list of texts (MultiSelect)
         * @member {Boolean} flat=false
         */
        flat: false,
        /**
         * @member {Object[]|null} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {cls: ['go-cf-selectoptions-list'], role: 'tree', cn: []},
            {cls: ['go-cf-selectoptions-tbar'], cn: [
                {tag: 'button', type: 'button', cls: ['neo-button', 'go-cf-selectoptions-add', 'go-cf-action'], 'data-action': 'add', cn: [
                    {tag: 'span', cls: ['go-icon'], text: 'add'},
                    {tag: 'span', cls: ['go-cf-selectoptions-add-text']}
                ]}
            ]}
        ]}
    }

    get listNode() {return this.vdom.cn[0]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.vdom.cn[1].cn[0].cn[1].text = t('Add option');
        me.vdom.cn[1].cn[0].title      = t('Add option');

        me.addDomListeners([
            {click   : me.onClick,       delegate: '.go-cf-action', scope: me},
            {dblclick: me.onDoubleClick, delegate: '.go-cf-selectoptions-row', scope: me}
        ]);

        me.renderList()
    }

    /**
     * Copies the options and gives each a client key (kept when it has one)
     * @param {Object[]|null} value
     * @returns {Object[]}
     */
    beforeSetValue(value) {
        const copy = options => (Array.isArray(options) ? options : []).map(o => ({
            ...o,
            key     : o.key ?? ++keySeed,
            children: this.flat ? [] : copy(o.children)
        }));

        return copy(value)
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderList()
    }

    /**
     * Options as the API takes them, sortOrder by position
     * @returns {Object[]}
     */
    getSubmitValue() {
        let me = this;

        const out = options => (options || []).map((o, index) => me.flat ? {
            id       : o.id ?? null,
            text     : o.text,
            sortOrder: index
        } : {
            id             : o.id ?? null,
            text           : o.text,
            sortOrder      : index,
            enabled        : o.enabled !== false,
            foregroundColor: o.foregroundColor || null,
            backgroundColor: o.backgroundColor || null,
            renderMode     : o.renderMode || null,
            children       : out(o.children)
        });

        return out(me.value)
    }

    get isDirty() {
        const strip = options => (options || []).map(({key, children, ...o}) => ({...o, children: strip(children)}));
        return !Neo.isEqual(strip(this.value), strip(this.beforeSetValue(this.originalConfig.value)))
    }

    /**
     * @param {Number} key
     * @returns {Object|null} {option, siblings, index}
     */
    find(key) {
        return SelectOptionsField.findIn(this.value || [], key)
    }

    /**
     * @param {Object[]} list options
     * @param {Number} key
     * @returns {Object|null} {option, siblings, index}
     */
    static findIn(list, key) {
        const walk = siblings => {
            for (const [index, option] of siblings.entries()) {
                if (option.key === key) {
                    return {option, siblings, index}
                }

                const found = walk(option.children || []);

                if (found) {
                    return found
                }
            }
            return null
        };

        return walk(list)
    }

    /**
     * @protected
     */
    renderList() {
        let me   = this,
            rows = [];

        const walk = (options, depth) => options.forEach((o, index) => {
            rows.push(me.createRow(o, depth, index === 0, index === options.length - 1));
            o.children?.length && walk(o.children, depth + 1)
        });

        walk(me.value || [], 0);

        me.listNode.cn = rows.length ? rows : [{cls: ['go-empty'], text: t('No items to display')}];
        me.update()
    }

    /**
     * @param {Object} option
     * @param {Number} depth
     * @param {Boolean} first
     * @param {Boolean} last
     * @returns {Object} vdom
     * @protected
     */
    createRow(option, depth, first, last) {
        let me      = this,
            key     = String(option.key),
            enabled = option.enabled !== false,
            button  = (action, icon, tooltip, disabled) => ({
                tag          : 'button',
                type         : 'button',
                cls          : ['neo-button', 'go-icon-button', 'go-cf-action'],
                title        : tooltip,
                'aria-label' : tooltip,
                disabled     : disabled || null,
                'data-action': action,
                'data-key'   : key,
                cn           : [{tag: 'span', cls: ['go-icon'], text: icon}]
            }),
            style   = {};

        option.foregroundColor && (style.color = '#' + option.foregroundColor);
        option.backgroundColor && (style.backgroundColor = '#' + option.backgroundColor);

        return {
            cls       : ['go-cf-selectoptions-row', ...enabled ? [] : ['go-disabled']],
            role      : 'treeitem',
            'data-key': key,
            style     : {paddingLeft: (depth * 24 + 8) + 'px'},
            cn        : [
                ...me.flat ? [] : [{
                    tag           : 'span',
                    cls           : ['go-check', 'go-cf-action', ...enabled ? ['go-checked'] : []],
                    role          : 'checkbox',
                    title         : t('Enabled'),
                    'aria-checked': String(enabled),
                    'data-action' : 'toggle',
                    'data-key'    : key
                }],
                {tag: 'span', cls: ['go-cf-selectoptions-text'], style, text: option.text || ''},
                button('edit', 'edit', t('Edit')),
                ...me.flat ? [] : [button('child', 'subdirectory_arrow_right', t('Add child option'))],
                button('up', 'arrow_upward', t('Move up'), first),
                button('down', 'arrow_downward', t('Move down'), last),
                button('delete', 'delete', t('Delete'))
            ]
        }
    }

    /**
     * Replaces the value with a changed copy and tells the form
     * @param {Function} change (options) => void, alters the copy
     * @protected
     */
    change(change) {
        let me       = this,
            oldValue = me.value,
            copy     = structuredClone(oldValue || []);

        change(copy);
        me.value = copy;
        me.fireUserChangeEvent(me.value, oldValue)
    }

    async onClick(data) {
        let me   = this,
            node = data.path?.find(n => n.data?.action),
            {action, key} = node?.data || {};

        if (!action || me.disabled) {
            return
        }

        if (action === 'add') {
            const option = await me.editOption({});
            option && me.change(list => list.push(me.newOption(option)));
            return
        }

        const found = me.find(Number(key));

        if (!found) {
            return
        }

        switch (action) {
            case 'toggle':
                me.changeOption(found, o => o.enabled = o.enabled === false);
                break;
            case 'edit': {
                const option = await me.editOption(found.option);
                option && me.changeOption(found, o => Object.assign(o, option, {enabled: true}));
                break
            }
            case 'child': {
                const option = await me.editOption({});
                option && me.changeOption(found, o => (o.children ||= []).push(me.newOption(option)));
                break
            }
            case 'up':
            case 'down': {
                const to = found.index + (action === 'up' ? -1 : 1);
                to >= 0 && to < found.siblings.length && me.changeSiblings(found, siblings => {
                    const [moved] = siblings.splice(found.index, 1);
                    siblings.splice(to, 0, moved)
                });
                break
            }
            case 'delete':
                me.changeSiblings(found, siblings => siblings.splice(found.index, 1));
                break
        }
    }

    onDoubleClick(data) {
        const node = data.path?.find(n => n.data?.key && !n.data?.action);

        node && !data.path.some(n => n.data?.action) && this.onClick({path: [{data: {action: 'edit', key: node.data.key}}]})
    }

    /**
     * @param {Object} attributes from the option dialog
     * @returns {Object}
     */
    newOption(attributes) {
        return {id: null, enabled: true, children: [], ...attributes, key: ++keySeed}
    }

    /**
     * Changes the option (in a copy of the value)
     * @param {Object} found find() result
     * @param {Function} fn (option) => void
     */
    changeOption(found, fn) {
        this.change(list => {
            const copy = SelectOptionsField.findIn(list, found.option.key);
            copy && fn(copy.option)
        })
    }

    /**
     * Changes the option's sibling list (in a copy of the value)
     * @param {Object} found find() result
     * @param {Function} fn (siblings) => void
     */
    changeSiblings(found, fn) {
        this.change(list => {
            const copy = SelectOptionsField.findIn(list, found.option.key);
            copy && fn(copy.siblings)
        })
    }

    /**
     * @param {Object} option
     * @returns {Promise<Object|null>}
     */
    editOption(option) {
        return OptionDialog.ask({appName: this.appName, windowId: this.windowId, option, colors: !this.flat})
    }
}

export default Neo.setupClass(SelectOptionsField);
