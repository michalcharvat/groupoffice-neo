import client         from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';

/**
 * Prototype only: "Dev" module, a component menu like the GOUI docs (menu.mjs),
 * one page per component with a demo from src/dev/demo/<Name>.mjs once converted.
 * Loaded with the debugger on (apps/go/app.mjs), shown to admins only: some demos change data.
 */
ModuleRegistry.register({
    package  : 'core',
    name     : 'dev',
    title    : 'Dev',
    iconCls  : 'fa fa-flask',
    icon     : 'science',
    available: () => client.isAdmin,
    mainView : () => import('./Playground.mjs')
});
