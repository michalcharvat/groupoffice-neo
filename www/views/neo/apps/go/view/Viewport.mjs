import BaseViewport from '../../../node_modules/neo.mjs/src/container/Viewport.mjs';
import client       from '../../../src/jmap/Client.mjs';
import LoginView    from './LoginView.mjs';
import MainView     from './MainView.mjs';
import {t} from '../../../src/Translate.mjs';

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

        client.restoreSession().then(session => {
            !session && me.showLogin()
        }).catch(e => {
            console.error(e);
            me.showLogin(e.message)
        })
    }

    destroy(...args) {
        this.removeClientListeners.forEach(fn => fn());
        super.destroy(...args)
    }

    showLogin(message) {
        let me = this;

        if (me.mainView) {
            me.remove(me.mainView);
            me.mainView = null
        }

        me.getReference('login').reset(message);
        me.layout.activeIndex = 1
    }

    showMain() {
        let me = this;

        if (!me.mainView) {
            me.mainView = me.add({module: MainView})
        }

        me.layout.activeIndex = 2
    }
}

export default Neo.setupClass(Viewport);
