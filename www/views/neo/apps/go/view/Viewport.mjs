import {loadClassicApps} from '../../../src/classicApps.mjs';
import BaseViewport from '../../../node_modules/neo.mjs/src/container/Viewport.mjs';
import HashHistory  from '../../../node_modules/neo.mjs/src/util/HashHistory.mjs';
import client       from '../../../src/jmap/Client.mjs';
import LoginView    from './LoginView.mjs';
import MainView     from './MainView.mjs';
import ModuleRegistry from '../../../src/ModuleRegistry.mjs';
import {t} from '../../../src/Translate.mjs';

/** "#recover/<hash>-<redirect>" of the password recovery mail (User::sendRecoveryMail()) */
const RECOVER = /^recover\/([a-f0-9]{40})-?(.*)$/;

/**
 * Card 0: loading, card 1: login, card 2: main view (created after login)
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'GO.view.Viewport',
        cls      : ['go-viewport'],
        layout   : {ntype: 'card', activeIndex: 0, removeInactiveCards: false},
        items    : [{
            ntype: 'component',
            cls  : ['go-loading'],
            text : t('Loading...')
        }, {
            module   : LoginView,
            reference: 'login'
        }]
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // the client lives in the shared App worker and outlives this window
        me.removeClientListeners = [
            client.on('login',        () => me.showMain()),
            client.on('logout',       () => me.showLogin()),
            client.on('unauthorized', () => me.showLogin(t('Your session has expired. Please log in again.')))
        ];

        // the password recovery link (User::sendRecoveryMail()) comes first, also when this
        // browser has a session: like go.Router's "recover" route (docs/neo-switch.md, D5)
        const hash    = (HashHistory.first(me.windowId) || Neo.windowConfigs?.[me.windowId]?.hash)?.hashString || '',
              recover = hash.match(RECOVER);

        // shown in onConstructed(): the login card does not exist yet
        me.recoverMatch = recover;
        me.recovering   = !!recover;

        client.restoreSession().then(session => {
            !session && !me.recovering && me.showLogin()
        }).catch(e => {
            console.error(e);
            me.showLogin(e.message)
        })
    }

    onConstructed() {
        super.onConstructed();

        const me = this;

        me.recoverMatch && me.startRecover(me.recoverMatch);

        // a recovery link opened in a tab that already runs GO (only the hash changes)
        me.hashListenerId = HashHistory.on('change', ({hashString, windowId}) => {
            const match = windowId === me.windowId && (hashString || '').match(RECOVER);
            match && me.startRecover(match)
        })
    }

    /**
     * @param {String[]} match RECOVER match: [, hash, redirect]
     */
    startRecover(match) {
        // the first hash event of a window repeats the hash it was opened with
        if (this.recovering && this.getReference('login').recoverHash === match[1]) {
            return
        }

        this.recovering = true;
        this.showLogin();
        this.getReference('login').showRecover(match[1], match[2])
    }

    destroy(...args) {
        HashHistory.un('change', this.hashListenerId);
        this.removeClientListeners.forEach(fn => fn());
        super.destroy(...args)
    }

    showLogin(message) {
        let me = this;

        me.showToken = null;

        if (me.mainView) {
            me.remove(me.mainView);
            me.mainView = null
        }

        me.getReference('login').reset(message);
        me.layout.activeIndex = 1
    }

    /**
     * The recovery card was left: the login, or the main view when there is a session
     */
    onRecoverDone() {
        let me = this;

        me.recovering = false;
        Neo.Main.setRoute({value: '', windowId: me.windowId});
        client.user ? me.showMain() : me.showLogin()
    }

    async showMain() {
        let me    = this,
            token = me.showToken = Symbol();

        // a recovery link stays on the login screen until its card is left
        if (me.recovering) {
            return
        }

        if (!me.mainView) {
            // modules may add modules for this user (ModuleRegistry onLogin)
            await ModuleRegistry.init();
            // modules only the classic client has: apps menu launchers, classic deep links
            await loadClassicApps();

            // logged out or shown again meanwhile
            if (me.isDestroyed || me.showToken !== token) {
                return
            }

            me.mainView = me.add({module: MainView})
        }

        me.layout.activeIndex = 2
    }
}

export default Neo.setupClass(Viewport);
