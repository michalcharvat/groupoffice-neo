import ModuleRegistry from '../ModuleRegistry.mjs';

/**
 * Prototype only: "Dev" module, a component menu like the GOUI docs (menu.mjs),
 * one page per component with a demo from src/dev/demo/<Name>.mjs once converted.
 */
ModuleRegistry.register({
    package : 'core',
    name    : 'dev',
    title   : 'Dev',
    iconCls : 'fa fa-flask',
    icon    : 'science',
    mainView: () => import('./Playground.mjs')
});
