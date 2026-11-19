import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'comments');

/**
 * Comments: the comments card itself is core (src/detail/CommentsPanel.mjs). The module
 * adds the comment labels to System settings (GOUI: LabelDialog behind the comments
 * card's settings button, administrators only).
 */
ModuleRegistry.register({
    package   : 'community',
    name      : 'comments',
    title     : t('Comments'),
    iconCls   : 'fa fa-comments',
    capability: 'go:community:comments',
    systemSettings: {
        title  : t('Comments'),
        iconCls: 'fa fa-comments',
        panel  : () => import('./view/LabelsPanel.mjs')
    }
});
