import Container     from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import LocalCombo    from '../../../../../views/neo/src/form/field/LocalCombo.mjs';
import {escapeHtml}  from '../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import ActionTable   from '../../../../../views/neo/src/list/ActionTable.mjs';
import TextList      from '../../../../../views/neo/src/list/TextList.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT}  from '../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import * as sieveApi from '../sieveApi.mjs';
import {fullAction, fullCriterium, t} from '../util.mjs';
import RuleDialog    from './RuleDialog.mjs';

/**
 * The sieve rules of an account in the account dialog's "Filters" card (ExtJS
 * GO.sieve.SieveGrid): choose and activate a filter set (script), add, edit (pencil or double
 * click), delete, enable / disable (checkbox) and reorder the rules.
 *
 * sieve/sieve/saveScriptsSortOrder always reorders the active script, so the move buttons
 * only work while the active filter set is shown.
 *
 *     panel.setAccount(accountId)
 *
 * Fires `activeScriptChange` {active} when another script became the active one (Activate,
 * or a save in an inactive script: the server activates every script it saves).
 */
class SieveRulesPanel extends Container {
    static config = {
        className: 'GO.sieve.SieveRulesPanel',
        cls      : ['go-sieve-rules-panel'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @member {Number|null} accountId=null
     */
    accountId = null

    /**
     * The name of the active script
     * @member {String} activeScript=''
     */
    activeScript = ''

    /**
     * The shown script
     * @member {String} scriptName=''
     */
    scriptName = ''

    /**
     * Folder names of the account, loaded with the first rule dialog
     * @member {String[]|null} folders=null
     */
    folders = null

    /**
     * A load, save or move is running
     * @member {Boolean} busy=false
     */
    busy = false

    /**
     * Counts the rule loads: only the last one shows
     * @member {Number} rulesGeneration=0
     */
    rulesGeneration = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom', 'go-sieve-rules-bar'],
            flex  : 'none',
            items : [{
                // no name: the account form must not submit it
                module      : LocalCombo,
                reference   : 'scriptCombo',
                labelText   : t('Filterset:'),
                labelPosition: 'inline',
                cls         : ['go-sieve-script-combo'],
                width       : null,
                flex        : 'none',
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                clearable   : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data: []}
            }, {
                module   : Button,
                reference: 'activateButton',
                icon     : 'check_circle',
                text     : t('Activate'),
                disabled : true,
                handler  : () => me.activateScript()
            }, '->', {
                module   : Button,
                reference: 'addButton',
                icon     : 'add',
                text     : coreT('Add'),
                disabled : true,
                handler  : () => me.openRule(null)
            }]
        }, {
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                columns  : [
                    {text: coreT('Name'), field: 'name', flex: true},
                    {text: t('Active'), field: 'active', type: 'check'}
                ],
                actions: [
                    {action: 'up', icon: 'arrow_upward', tooltip: t('Move up'), disabled: r => !me.canMove() || me.indexOf(r) < 1},
                    {action: 'down', icon: 'arrow_downward', tooltip: t('Move down'), disabled: r => !me.canMove() || me.indexOf(r) >= me.records.length - 1},
                    {action: 'edit', icon: 'edit', tooltip: coreT('Edit')},
                    {action: 'delete', icon: 'delete', tooltip: coreT('Delete')}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.table;

        table.on('action', ({action, record}) => me.onAction(action, record));
        table.on('rowDoubleClick', ({record}) => me.openRule(record));
        table.on('check', ({record, checked}) => me.setActive(record, checked));
        me.getReference('scriptCombo').on('change', ({value}) => me.onScriptChange(value?.id ?? value))
    }

    /**
     * @returns {GO.list.ActionTable}
     */
    get table() {
        return this.getReference('table')
    }

    /**
     * @returns {Object[]}
     */
    get records() {
        return this.table.records
    }

    /**
     * @param {Object} record
     * @returns {Number}
     */
    indexOf(record) {
        return this.records.findIndex(r => r.index === record.index)
    }

    /**
     * @returns {Boolean} the shown script is the active one (saveScriptsSortOrder)
     */
    canMove() {
        return !this.busy && !!this.scriptName && this.scriptName === this.activeScript
    }

    /**
     * Shows the filter sets and the rules of the active one
     * @param {Number|null} accountId
     */
    async setAccount(accountId) {
        let me = this;

        me.accountId    = accountId;
        me.activeScript = '';
        me.folders      = null;
        await me.loadScripts()
    }

    /**
     * sieve/sieve/scripts, then the rules of the shown (or active) script
     * @param {String|null} activate a script to make the active one first
     */
    async loadScripts(activate=null) {
        let me    = this,
            combo = me.getReference('scriptCombo');

        if (!me.accountId) {
            return
        }

        try {
            const {active, scripts} = await sieveApi.scripts(me.accountId, activate);

            if (me.isDestroyed) {
                return
            }

            const previous = me.activeScript;

            me.activeScript = active;
            me.scriptName   = scripts.some(s => s.id === me.scriptName) ? me.scriptName : active;

            // the out of office rule lives in the active script (see Index.mjs)
            previous && previous !== active && me.fire('activeScriptChange', {active});
            combo.store.data = scripts;
            me.applyingScript = true;
            combo.value = me.scriptName || null;
            me.applyingScript = false;
            me.getReference('addButton').disabled = !me.scriptName;
            me.updateActivateButton();
            await me.loadRules()
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @protected
     */
    updateActivateButton() {
        this.getReference('activateButton').disabled = !this.scriptName || this.scriptName === this.activeScript
    }

    /**
     * @param {String|null} name
     * @protected
     */
    onScriptChange(name) {
        let me = this;

        if (me.applyingScript || !name || name === me.scriptName) {
            return
        }

        me.scriptName = name;
        me.updateActivateButton();
        me.loadRules()
    }

    /**
     * Makes the shown filter set the active one (ExtJS "Activate")
     */
    activateScript() {
        this.scriptName && this.loadScripts(this.scriptName)
    }

    async loadRules() {
        let me         = this,
            generation = ++me.rulesGeneration;

        if (!me.accountId || !me.scriptName) {
            me.table.records = [];
            return
        }

        try {
            const rules = await sieveApi.rules(me.accountId, me.scriptName);

            // a later load (another script) wins
            !me.isDestroyed && generation === me.rulesGeneration && (me.table.records = rules)
        } catch (e) {
            notifyError(me, e)
        }
    }

    onAction(action, record) {
        switch (action) {
            case 'edit':   return this.openRule(record);
            case 'delete': return this.deleteRule(record);
            case 'up':     return this.move(record, -1);
            case 'down':   return this.move(record, 1)
        }
    }

    /**
     * Runs one change of the shown script at a time, then loads the scripts and rules again:
     * the server makes every script it saves the active one (Sieve::save()), and the indexes
     * of the rules change
     * @param {Function} fn async (accountId, scriptName) => void
     * @protected
     */
    async mutate(fn) {
        let me = this;

        if (me.busy || !me.accountId || !me.scriptName) {
            return
        }

        me.busy = true;

        try {
            await fn(me.accountId, me.scriptName)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            me.busy = false
        }

        me.isDestroyed || await me.loadScripts()
    }

    /**
     * @returns {Promise<String[]>} folder names of the account (move / copy actions)
     * @protected
     */
    async getFolders() {
        let me = this;

        if (!me.folders) {
            const {results = []} = await client.legacy('email/folder/store', {account_id: me.accountId});
            me.folders = results.map(r => r.name)
        }

        return me.folders
    }

    /**
     * @param {Object|null} record null for a new rule
     */
    async openRule(record) {
        let me = this;

        if (me.busy || !me.accountId || !me.scriptName) {
            return
        }

        me.busy = true;

        try {
            const dialog = await RuleDialog.open({
                appName   : me.appName,
                windowId  : me.windowId,
                accountId : me.accountId,
                scriptName: me.scriptName,
                index     : record ? record.index : -1,
                folders   : await me.getFolders().catch(() => [])
            });

            // the account dialog was closed meanwhile
            if (me.isDestroyed) {
                dialog.close();
                return
            }

            dialog.on('save', () => me.isDestroyed || me.loadScripts())
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        } finally {
            me.busy = false
        }
    }

    async deleteRule(record) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(coreT('Are you sure you want to delete the selected item?'))
        });

        ok && !me.isDestroyed && await me.mutate((accountId, scriptName) => sieveApi.deleteRules(accountId, scriptName, [record.index]))
    }

    /**
     * Enables or disables a rule: the rule is saved again with its own conditions and actions
     * @param {Object} record
     * @param {Boolean} active
     */
    async setActive(record, active) {
        let me = this;

        if (me.busy) {
            // the checkbox changed already: show the real state again
            return me.loadRules()
        }

        await me.mutate(async (accountId, scriptName) => {
            const {data, criteria, actions} = await sieveApi.rule(accountId, scriptName, record.index);

            await sieveApi.submitRule({
                accountId,
                scriptName,
                index     : record.index,
                name      : data.rule_name,
                active,
                join      : data.join,
                criteria  : criteria.map(fullCriterium),
                actions   : actions.map(fullAction)
            })
        })
    }

    /**
     * Moves a rule up or down and saves the order of the active script
     * @param {Object} record
     * @param {Number} step -1 or 1
     */
    async move(record, step) {
        let me      = this,
            records = [...me.records],
            index   = me.indexOf(record),
            target  = index + step;

        if (!me.canMove() || index < 0 || target < 0 || target >= records.length) {
            return
        }

        [records[index], records[target]] = [records[target], records[index]];
        me.table.records = records;

        await me.mutate(accountId => sieveApi.saveSortOrder(accountId, records.map(r => r.index)))
    }
}

export default Neo.setupClass(SieveRulesPanel);
