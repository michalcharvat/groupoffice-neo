import CommentsPanel   from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'comments');

/**
 * System settings card "Comments": the labels users can put on comments (GOUI LabelDialog),
 * name and colour
 */
class LabelsPanel extends EntityListPanel {
    static config = {
        className   : 'GO.comments.view.LabelsPanel',
        entity      : 'CommentLabel',
        properties  : ['id', 'name', 'color'],
        jmapSort    : [{property: 'name', isAscending: true}],
        addText     : t('Add'),
        dialog      : () => import('./LabelDialog.mjs'),
        columns     : [{
            text: t('Labels'),
            flex: true,
            vdom: record => [CommentsPanel.labelIconVdom(record), {tag: 'span', text: record.name || ''}]
        }]
    }
}

export default Neo.setupClass(LabelsPanel);
