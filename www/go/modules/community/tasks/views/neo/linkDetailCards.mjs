import {translator} from '../../../../../../views/neo/src/Translate.mjs';
import TaskLinkCard from './view/TaskLinkCard.mjs';

const t = translator('community', 'tasks');

/**
 * "Incomplete tasks" and "Completed tasks" in other items' details (ExtJS Module.js
 * linkDetailCards). See ModuleRegistry `linkDetailCards`.
 *
 * @returns {Object[]} card configs
 */
export default function linkDetailCards() {
    return [
        {module: TaskLinkCard, title: t('Incomplete tasks'), stateId: 'link-tasks-incomplete', complete: false},
        {module: TaskLinkCard, title: t('Completed tasks'), stateId: 'link-tasks-completed', complete: true}
    ]
}
