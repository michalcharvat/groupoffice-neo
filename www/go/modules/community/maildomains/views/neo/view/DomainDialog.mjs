import NumberField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import TextField      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox   from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import SharePanel     from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow     from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {MB, t}        from './util.mjs';

/** quotas: bytes on the server, MB in the form */
const QUOTA_FIELDS = ['defaultQuota', 'totalQuota'];

/**
 * Create or edit a mail domain (GOUI DomainDialog): owner, domain, limits, quotas,
 * and who it is shared with (acl) on a second tab.
 */
class DomainDialog extends FormWindow {
    static config = {
        className : 'GO.maildomains.view.DomainDialog',
        cls       : ['go-form-window', 'go-md-domain-dialog'],
        entityName: 'MailDomain',
        properties: ['id', 'userId', 'domain', 'description', 'transport', 'maxAliases', 'maxMailboxes',
                     'defaultQuota', 'totalQuota', 'active', 'backupMx', 'acl'],
        title     : t('Domain'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 250px)', top: '10vh', width: '500px'}
    }

    onConstructed() {
        // the cards exist from here on; 'formReady' fires later, after the load
        const result = super.onConstructed();

        this.form.on({
            beforeload: ({data}) => QUOTA_FIELDS.forEach(name => {
                name in data && (data[name] = Math.round((data[name] || 0) / MB))
            }),
            beforesave: ({data}) => QUOTA_FIELDS.forEach(name => {
                name in data && (data[name] = (Number(data[name]) || 0) * MB)
            })
        });

        this.addSharePanel();
        return result
    }

    /**
     * "Permissions" tab: the acl property as a form field
     */
    addSharePanel() {
        let me = this;

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('MailDomain', currentId || null).catch(e => console.error('SharePanel', e));

            // a new domain's default ACL arrives after the form took its unmodified state
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        })
    }

    onReady() {
        super.onReady();
        // GOUI: the domain name can't be changed (mailbox and alias addresses contain it)
        this.form.currentId && (this.getReference('domain').disabled = true)
    }

    createFormItems() {
        const field = config => ({labelPosition: 'inline', flex: 'none', ...config}),
              // neo's NumberField defaults to maxValue 100 (null would clamp to 0)
              number = config => field({module: NumberField, minValue: 0, maxValue: Number.MAX_SAFE_INTEGER, stepSize: 1, ...config});

        return [{
            ntype : 'container',
            cls   : ['go-md-form-scroll'],
            // its content height: the card scrolls (a flexed vbox child would be cut off)
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [
                field({module: PrincipalCombo, principalEntity: 'User', name: 'userId', labelText: t('User'), required: true}),
                field({module: TextField, name: 'domain', reference: 'domain', labelText: t('Domain'), required: true}),
                field({module: TextField, name: 'description', labelText: t('Description')}),
                number({name: 'maxAliases', labelText: t('Max aliases')}),
                number({name: 'maxMailboxes', labelText: t('Max mailboxes')}),
                number({name: 'defaultQuota', labelText: t('Default quota (MB)')}),
                number({name: 'totalQuota', labelText: t('Max quota (MB)')}),
                {module: BoolCheckBox, name: 'active', valueLabel: t('Active')},
                {module: BoolCheckBox, name: 'backupMx', valueLabel: t('Backup MX')}
            ]
        }]
    }
}

export default Neo.setupClass(DomainDialog);
