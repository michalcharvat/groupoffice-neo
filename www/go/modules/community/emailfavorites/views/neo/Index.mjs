import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'emailfavorites');

/**
 * E-mail favorites (ExtJS emailfavorites: EmailClientOverride): the user's favourite folders
 * at the top of the e-mail account tree, through the e-mail client's `emailTreeSections` extension point (docs/neo-email-module.md).
 */
ModuleRegistry.register({
    package   : 'community',
    name      : 'emailfavorites',
    title     : t('Email favorites'),
    capability: 'go:community:emailfavorites',
    emailTreeSections: {
        id   : 'favorites',
        // no header: like ExtJS a starred list above the accounts, hidden when empty
        order: 10,
        watch: ['Favoritefolder'],
        nodes: async tree => (await import('./view/favorites.mjs')).nodes(tree)
    }
});
