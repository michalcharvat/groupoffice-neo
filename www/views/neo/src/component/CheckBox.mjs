import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';

/**
 * GOUI checkbox look (goui/style/_form.scss ".check.box input") without a form field:
 * a box with a tick, optionally half checked. Used for "select all" in list toolbars.
 *
 *     {module: CheckBox, listeners: {change: ({checked}) => ...}}
 */
class CheckBox extends Component {
    static config = {
        className: 'GO.component.CheckBox',
        baseCls  : ['go-check'],
        /**
         * @member {Boolean} checked_=false
         */
        checked_: false,
        /**
         * Some but not all are checked: shows a dash
         * @member {Boolean} indeterminate_=false
         */
        indeterminate_: false,
        role     : 'checkbox',
        _vdom    : {tabIndex: 0, 'aria-checked': 'false'}
    }

    construct(config) {
        super.construct(config);

        this.addDomListeners([{click: this.onClick, scope: this}])
    }

    afterSetChecked(value) {
        this.toggleCls('go-checked', !!value);
        this.syncAria()
    }

    afterSetIndeterminate(value) {
        this.toggleCls('go-indeterminate', !!value);
        this.syncAria()
    }

    syncAria() {
        let me = this;

        me.vdom['aria-checked'] = me.indeterminate ? 'mixed' : String(!!me.checked);
        me.update()
    }

    onClick() {
        let me = this;

        if (me.disabled) {
            return
        }

        // GOUI selectallcheckboxfield: a half checked box selects all
        me.set({checked: me.indeterminate || !me.checked, indeterminate: false});
        me.fire('change', {checked: me.checked})
    }
}

export default Neo.setupClass(CheckBox);
