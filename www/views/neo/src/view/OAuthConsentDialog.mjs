import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../button/Button.mjs';
import Dialog, {headerTools} from './Dialog.mjs';
import client    from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import {escapeHtml} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {postForm}  from '../postForm.mjs';
import {t}         from '../Translate.mjs';

/**
 * Asks the user to approve an application that registered itself, like an AI assistant
 * (port of the GOUI OAuthConsent in groupoffice-core/script/auth/OAuthConsent.ts).
 *
 * The Viewport opens it when api/oauth.php sent the user back with "?oauthConsent=1"
 * (docs/neo-switch.md, D5). The decision is posted to api/oauth.php/authorize with the CSRF token
 * as a real form post in this window, so the browser follows the redirect to the application.
 *
 * Modules add a panel for their scope (GOUI oauthConsent.registerPanel()) in their registration:
 *
 *     ModuleRegistry.register({…,
 *         oauthConsentPanels: {
 *             // details: what api/oauth.php/consent returned (clientName, redirectHost, scopes, …)
 *             mcp: async details => ({
 *                 component: {module: MyPanel},  // config of the panel, below the text
 *                 getData  : () => ({…}),         // sent with the approval to the module's consent listener
 *                 validate : () => true           // optional: false keeps the dialog open
 *             })
 *         }
 *     })
 *
 *     await OAuthConsentDialog.open({appName, windowId})
 */
class OAuthConsentDialog extends Dialog {
    static config = {
        className   : 'GO.view.OAuthConsentDialog',
        cls         : ['go-oauth-consent-dialog'],
        modal       : true,
        resizable   : false,
        // only the decision closes it: the page leaves for the application
        headerConfig: headerTools(),
        wrapperStyle: {
            left  : 'max(0px, calc(50vw - 320px))',
            top   : '20px',
            width    : 'min(640px, 100vw)',
            maxHeight: 'min(720px, calc(100vh - 40px))'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * What api/oauth.php/consent returned
         * @member {Object|null} details=null
         */
        details: null,
        /**
         * Module panels: [{scope, panel: {component, getData, validate}}]
         * @member {Object[]} panels=[]
         */
        panels: [],
        /**
         * A module's panel failed to load: the approval would miss its data, only Deny is offered
         * @member {Boolean} panelFailed=false
         */
        panelFailed: false
    }

    construct(config) {
        super.construct(config);

        let me      = this,
            details = me.details,
            name    = '<b>' + escapeHtml(details.clientName) + '</b>',
            host    = '<b>' + escapeHtml(details.redirectHost) + '</b>',
            html    = '<p>' + escapeHtml(t('{name} wants to access your GroupOffice account.')).replace('{name}', name) + '</p>'
                + '<p>' + escapeHtml(t('It may:')) + '</p><ul>'
                + (details.scopes || []).map(s => '<li>' + escapeHtml(s.description) + '</li>').join('')
                + '</ul><p>' + escapeHtml(t('After your decision you are sent back to {host}.')).replace('{host}', host) + '</p>';

        if (details.localhostOnly) {
            html += '<p class="go-oauth-consent-warning">'
                + escapeHtml(t('This application runs on your own computer. Only allow it if you started it yourself.')) + '</p>';
        }

        me.items = [{
            // the panels of modules can be long, like a list of items: they scroll, the buttons stay
            module: Container,
            cls   : ['go-oauth-consent-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'component',
                cls  : ['go-confirm-message', 'go-oauth-consent-message'],
                // markup: every value in it is escaped above
                html
            }, ...me.panels.map(p => p.panel.component)]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                module   : Button,
                reference: 'denyButton',
                text     : t('Deny'),
                handler  : () => me.decide('deny', {})
            }, '->', {
                module   : Button,
                reference: 'allowButton',
                ui       : 'primary',
                disabled : me.panelFailed,
                text     : t('Allow'),
                handler  : () => me.approve()
            }]
        }]
    }

    /**
     * Escape doesn't close it: the request waits for a decision
     */
    onKeyDownEscape() {}

    approve() {
        const data = {};

        if (this.panelFailed) {
            return
        }

        for (const {scope, panel} of this.panels) {
            if (panel.validate && !panel.validate()) {
                return
            }
            data[scope] = panel.getData();
        }

        this.decide('approve', data)
    }

    /**
     * Posts the decision; api/oauth.php sends the browser on to the application
     * @param {String} decision 'approve' or 'deny'
     * @param {Object} data module data by scope
     */
    async decide(decision, data) {
        const me = this;

        // once: the page is leaving
        me.getReference('allowButton').disabled = true;
        me.getReference('denyButton').disabled  = true;

        try {
            await postForm(me.windowId, client.apiUrl + 'oauth.php/authorize', {
                requestId: me.details.requestId,
                decision,
                data     : JSON.stringify(data),
                CSRFToken: client.csrfToken || ''
            }, '_self')
        } catch (e) {
            me.getReference('allowButton').disabled = me.panelFailed;
            me.getReference('denyButton').disabled  = false;
            notifyError(me, e)
        }
    }

    /**
     * Loads the pending request and shows the dialog
     * @param {Object} owner appName and windowId
     * @returns {Promise<GO.view.OAuthConsentDialog|null|false>} null: no request waits (expired, or decided in
     *     another tab); false: it could not be loaded (offline, server error), it may still wait
     */
    static async open({appName, windowId}) {
        const owner = {appName, windowId};

        let details;

        try {
            const response = await fetch(client.apiUrl + 'oauth.php/consent', {credentials: 'same-origin'});

            if (response.status === 404) {
                notifyError(owner, new Error(t('The authorization request expired. Please connect the application again.')));
                return null
            }

            if (!response.ok) {
                throw new Error(response.statusText || String(response.status))
            }

            details = await response.json();
        } catch (e) {
            notifyError(owner, e);
            return false
        }

        const factories = Object.assign({}, ...ModuleRegistry.getConfigs('oauthConsentPanels')),
              panels    = [];

        let panelFailed = false;

        for (const scope of details.scopes || []) {
            const factory = factories[scope.name];

            if (factory) {
                try {
                    panels.push({scope: scope.name, panel: await factory(details)})
                } catch (e) {
                    // without the module's panel the approval would miss its data: only Deny is safe
                    panelFailed = true;
                    notifyError(owner, e)
                }
            }
        }

        return Neo.create(OAuthConsentDialog, {
            appName,
            windowId,
            title: t('Connect {name}').replace('{name}', details.clientName),
            details,
            panels,
            panelFailed
        })
    }
}

export default Neo.setupClass(OAuthConsentDialog);
