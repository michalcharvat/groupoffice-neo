import Button         from '../../button/Button.mjs';
import Container      from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import FormContainer  from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import GroupCombo     from '../../form/field/GroupCombo.mjs';
import JmapComboBox   from '../../form/field/JmapComboBox.mjs';
import PrincipalCombo from '../../form/field/PrincipalCombo.mjs';
import TextField      from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import {escapeHtml}   from '../../Format.mjs';

/**
 * Dev demo: JmapComboBox, PrincipalCombo, GroupCombo in a form; setValues() /
 * getValues() round trip with entity ids.
 */
class JmapComboDemo extends Container {
    static config = {
        className: 'GO.dev.demo.JmapCombo',
        layout   : {ntype: 'vbox', align: 'start'},
        style    : {padding: '16px', gap: '12px', overflow: 'auto'},
        items    : [{
            module   : FormContainer,
            reference: 'form',
            layout   : {ntype: 'vbox', align: 'start'},
            style    : {gap: '12px'},
            items    : [{
                module         : PrincipalCombo,
                principalEntity: 'User',
                name           : 'userId',
                labelPosition  : 'inline',
                width          : 320
            }, {
                module       : GroupCombo,
                name         : 'groupId',
                labelPosition: 'inline',
                width        : 320
            }, {
                module       : JmapComboBox,
                entity       : 'NoteBook',
                name         : 'noteBookId',
                labelText    : 'NoteBook (JmapComboBox)',
                labelPosition: 'inline',
                jmapSort     : [{property: 'name', isAscending: true}],
                properties   : ['id', 'name'],
                width        : 320
            }]
        }, {
            module       : TextField,
            reference    : 'setValues',
            labelText    : 'setValues() JSON',
            labelPosition: 'inline',
            value        : '{"userId": 1, "groupId": 2, "noteBookId": 65}',
            width        : 320
        }, {
            ntype : 'container',
            layout: {ntype: 'hbox'},
            style : {gap: '8px'},
            items : [{
                module   : Button,
                ui       : 'secondary',
                text     : 'form.setValues()',
                reference: 'onSetValues'
            }, {
                module   : Button,
                ui       : 'secondary',
                text     : 'form.getValues()',
                reference: 'onGetValues'
            }, {
                module   : Button,
                ui       : 'secondary',
                text     : 'reset()',
                reference: 'onReset'
            }]
        }, {
            ntype    : 'component',
            reference: 'output',
            tag      : 'pre',
            text     : ''
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        ['onSetValues', 'onGetValues', 'onReset'].forEach(name => {
            me.getReference(name).handler = () => me[name]()
        })
    }

    async onSetValues() {
        let me = this;

        try {
            await me.getReference('form').setValues(JSON.parse(me.getReference('setValues').value))
        } catch (e) {
            me.getReference('output').html = escapeHtml(String(e))
        }
    }

    async onGetValues() {
        this.getReference('output').html = escapeHtml(JSON.stringify(await this.getReference('form').getValues(), null, 2))
    }

    async onReset() {
        await this.getReference('form').setValues({userId: null, groupId: null, noteBookId: null})
    }
}

export default Neo.setupClass(JmapComboDemo);
