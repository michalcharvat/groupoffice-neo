import Field    from './Field.mjs';
import MenuList from '../../menu/List.mjs';

/**
 * GOUI SelectField: fixed options in the GO field box. Looks like the neo combo boxes
 * (text and an expand trigger) and opens a GO menu, not the browser's select list. Option
 * values may be any scalar or null; the option is matched loosely ("30" == 30).
 *
 *     {module: SelectField, name: 'privacy', labelText: t('Visibility'),
 *      options: [{value: 'public', text: t('Public')}, {value: 'private', text: t('Private')}]}
 */
class SelectField extends Field {
    static config = {
        className: 'GO.form.field.SelectField',
        ntype    : 'go-selectfield',
        baseCls  : ['go-field', 'go-selectfield'],
        /**
         * @member {Object[]} options_=[] {value, text}
         */
        options_: []
    }

    /** @member {GO.menu.List|null} menu=null */
    menu = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click  : me.onBoxClick, scope: me},
            {keydown: me.onKeyDown,  delegate: '.go-selectfield-expand', scope: me}
        ])
    }

    destroy(...args) {
        this.hideMenu();
        super.destroy(...args)
    }

    afterSetOptions(value, oldValue) {
        if (oldValue !== undefined) {
            // an open menu would offer the old options
            this.hideMenu();
            this.renderControl()
        }
    }

    /**
     * Index of the option of a value
     * @param {*} value
     * @returns {Number}
     */
    indexOf(value) {
        return this.options.findIndex(o => (o.value ?? null) === (value ?? null) || (o.value != null && value != null && String(o.value) === String(value)))
    }

    createControl() {
        let me     = this,
            option = me.options[me.indexOf(me.value)],
            items  = [{cls: ['go-selectfield-text'], text: option?.text || ' '}];

        if (!me.readOnly && !me.disabled) {
            items.push({
                tag            : 'button',
                type           : 'button',
                cls            : ['go-field-tool', 'go-selectfield-expand'],
                id             : me.id + '__expand',
                // the focusable control: it announces the label and the selected option
                'aria-label'   : [me.labelText, option?.text].filter(Boolean).join(': ') || null,
                'aria-haspopup': 'menu',
                'aria-expanded': me.isMenuOpen() ? 'true' : 'false',
                cn             : [{tag: 'i', cls: ['go-icon'], 'aria-hidden': 'true', text: 'expand_more'}]
            })
        }

        return items
    }

    /**
     * @returns {Boolean}
     */
    isMenuOpen() {
        return !!this.menu && !this.menu.isDestroyed
    }

    hideMenu() {
        const menu = this.menu;

        this.menu = null;
        menu && !menu.isDestroyed && menu.destroy()
    }

    onBoxClick({path}) {
        let me = this;

        !me.readOnly && !me.disabled && path.some(node => node.cls?.includes('go-field-box')) && me.showMenu()
    }

    /** Arrow down / up on the trigger opens the options, as on a select */
    onKeyDown({key}) {
        let me = this;

        if ((key === 'ArrowDown' || key === 'ArrowUp') && !me.readOnly && !me.disabled) {
            me.showMenu()
        }
    }

    /** Opens the options below the field, as wide as the field; the selected one is checked */
    async showMenu() {
        let me = this;

        if (me.isMenuOpen()) {
            return
        }

        const rect = await me.getDomRect(me.id);

        // destroyed, locked, or a second click opened it meanwhile
        if (me.isDestroyed || me.readOnly || me.disabled || me.isMenuOpen()) {
            return
        }

        const selected = me.indexOf(me.value);

        const menu = me.menu = MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.id,
            align   : {edgeAlign: 't0-b0', axisLock: true},
            width   : rect?.width || 240,
            items   : me.options.map((o, i) => ({
                id     : 'option-' + i,
                text   : o.text,
                // a blank icon on the others keeps the texts in line
                icon   : i === selected ? 'check' : ' ',
                // the field may have been locked while the menu was open
                handler: () => !me.readOnly && !me.disabled && me.userChange(o.value ?? null)
            }))
        });

        // closed by the user (hideMenu() lets go of it first)
        menu.on('destroy', () => {
            if (me.menu === menu) {
                me.menu = null;
                me.isDestroyed || me.renderControl()
            }
        });

        me.renderControl()
    }
}

export default Neo.setupClass(SelectField);
