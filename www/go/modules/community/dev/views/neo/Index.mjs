import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';

/**
 * Developer module (go/modules/community/dev): the login step of its dummy secondary
 * authenticator (model/DummyAuthenticator, registered in Module.php when uncommented).
 * Not named "dev": that is the neo component playground (views/neo/src/dev).
 */
ModuleRegistry.register({
    package   : 'community',
    name      : 'community-dev',
    title     : 'Developer',
    iconCls   : 'fa fa-code',
    capability: 'go:community:dev',
    // go.AuthenticationManager.register('dummy', ...)
    loginPanels: {
        dummy: () => import('./view/DummyLoginPanel.mjs')
    }
});
