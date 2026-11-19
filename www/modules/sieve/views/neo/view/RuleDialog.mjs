import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox     from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import LocalCombo       from '../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList         from '../../../../../views/neo/src/list/TextList.mjs';
import {t as coreT}     from '../../../../../views/neo/src/Translate.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import * as sieveApi    from '../sieveApi.mjs';
import {actionText, centered, criteriumText, field, fullAction, fullCriterium, isSpamRule, t} from '../util.mjs';
import ActionDialog     from './ActionDialog.mjs';
import CriteriumDialog  from './CriteriumDialog.mjs';
import RulePartsPanel   from './RulePartsPanel.mjs';

/**
 * Opens a dialog and resolves with the data of its `save` event, null when it closes without
 * @param {Object} Cls
 * @param {Object} config
 * @returns {Promise<Object|null>}
 */
function editIn(Cls, config) {
    return new Promise(resolve => {
        const dialog = Neo.create(Cls, config);
        let result = null;

        dialog.on('save', ({data}) => result = data);
        dialog.on('close', () => resolve(result))
    })
}

/**
 * A sieve rule (ExtJS GO.sieve.SieveDialog): name, active, which mail (all conditions, one of
 * them, every mail), the conditions and the actions. Saves with sieve/sieve/submitRules.
 *
 *     const dialog = await RuleDialog.open({appName, windowId, accountId, scriptName, index, folders});
 *     dialog.on('save', …)    // index -1: a new rule
 */
class RuleDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.sieve.RuleDialog',
        cls         : ['go-form-window', 'go-sieve-rule-dialog'],
        wrapperStyle: centered(700, 720),
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * @member {String} scriptName=''
         */
        scriptName: '',
        /**
         * Script index of the rule, -1 for a new rule
         * @member {Number} index=-1
         */
        index: -1,
        /**
         * Folder names of the account (move / copy actions)
         * @member {String[]} folders=[]
         */
        folders: [],
        /**
         * Alias addresses of the account (new vacation actions)
         * @member {String} aliases=''
         */
        aliases: '',
        /**
         * sieve/sieve/rule criteria and actions of an existing rule
         * @member {Object} rule={criteria: [], actions: []}
         */
        rule: {criteria: [], actions: []}
    }

    /**
     * The conditions or actions were changed
     * @member {Boolean} partsChanged=false
     */
    partsChanged = false

    /**
     * Loads the rule (index >= 0) and the aliases (a new rule), then opens the dialog
     * @param {Object} config appName, windowId, accountId, scriptName, index, folders
     * @returns {Promise<RuleDialog>}
     */
    static async open({index=-1, ...config}) {
        let rule   = {data: {}, criteria: [], actions: []},
            aliases = '';

        if (index >= 0) {
            rule = await sieveApi.rule(config.accountId, config.scriptName, index)
        } else {
            // ExtJS: the aliases are the default addresses of a vacation action
            aliases = await sieveApi.accountAliases(config.accountId).catch(e => {
                console.error('sieve/sieve/accountAliases', e);
                return ''
            })
        }

        const data = rule.data;

        return Neo.create(RuleDialog, {
            ...config,
            index,
            aliases,
            rule  : {
                criteria: rule.criteria.filter(c => c.test !== 'true').map(fullCriterium),
                actions : rule.actions.map(fullAction)
            },
            title : index >= 0 ? t('Edit rule') : t('New rule'),
            values: {
                rule_name: data.rule_name || '',
                active   : index >= 0 ? !!data.active : true,
                join     : data.join || 'anyof'
            }
        })
    }

    createFormItems() {
        let me = this;

        return [
            field(TextField, 'rule_name', coreT('Name'), {required: true}),
            {module: BoolCheckBox, name: 'active', valueLabel: t('Activate this filter'), flex: 'none'},
            field(LocalCombo, 'join', t('For incoming emails'), {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                clearable   : false,
                required    : true,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data: [
                    {id: 'allof', name: t('that meet the following criteria')},
                    {id: 'anyof', name: t('that meet at least one of the following criteria')},
                    {id: 'any',   name: t('all incoming emails')}
                ]}
            }),
            {
                module    : RulePartsPanel,
                reference : 'criteriaPanel',
                flex      : 'none',
                title     : '...' + t('meeting these criteria') + ':',
                emptyText : t("Please click 'add' to add a criterium"),
                render    : criteriumText,
                openEditor: criterium => editIn(CriteriumDialog, {appName: me.appName, windowId: me.windowId, criterium})
            },
            {
                module    : RulePartsPanel,
                reference : 'actionsPanel',
                flex      : 'none',
                title     : t('...execute the following actions'),
                emptyText : t("Please click 'add' to add an action"),
                render    : a => a.text || actionText(a),
                openEditor: action => editIn(ActionDialog, {
                    appName : me.appName,
                    windowId: me.windowId,
                    action,
                    folders : me.folders,
                    aliases : me.aliases
                })
            }
        ]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        me.criteriaPanel.setValues(me.rule.criteria);
        me.actionsPanel.setValues(me.rule.actions);
        me.criteriaPanel.on('change', () => me.partsChanged = true);
        me.actionsPanel.on('change', () => me.partsChanged = true);

        me.form.on('fieldChange', ({component}) => component?.name === 'join' && me.syncJoin());

        await me.readyPromise;
        me.isDestroyed || me.syncJoin()
    }

    /**
     * @returns {RulePartsPanel}
     */
    get criteriaPanel() {
        return this.getReference('criteriaPanel')
    }

    /**
     * @returns {RulePartsPanel}
     */
    get actionsPanel() {
        return this.getReference('actionsPanel')
    }

    /**
     * "all incoming emails" has no conditions
     * @protected
     */
    async syncJoin() {
        let me   = this,
            join = (await me.form.getField('join'))?.getSubmitValue();

        me.isDestroyed || (me.criteriaPanel.hidden = join === 'any')
    }

    async isModified() {
        return this.partsChanged || super.isModified()
    }

    async save(modified, values) {
        let me       = this,
            criteria = values.join === 'any' ? [] : me.criteriaPanel.getValues(),
            actions  = me.actionsPanel.getValues();

        if (!actions.length || (values.join !== 'any' && !criteria.length)) {
            throw new Error(t('One or both grids are empty.'))
        }

        // ExtJS: a spam rule ends with "stop"
        if (isSpamRule(criteria) && !actions.some(a => a.type === 'stop')) {
            actions = [...actions, {type: 'stop', target: '', days: '', reason: '', addresses: '', text: t('Stop')}]
        }

        await sieveApi.submitRule({
            accountId : me.accountId,
            scriptName: me.scriptName,
            index     : me.index,
            name      : values.rule_name,
            active    : !!values.active,
            join      : values.join,
            criteria,
            actions
        });

        return {index: me.index}
    }
}

export default Neo.setupClass(RuleDialog);
