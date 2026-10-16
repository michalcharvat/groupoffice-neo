import SharePanel   from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'calendar');

/** GOUI modules.register() entity permissions */
export const CALENDAR_LEVELS = () => [
    {value: '', name: t('None')},
    {value: 5,  name: t('Read free/busy')},
    {value: 10, name: t('Read items')},
    {value: 20, name: t('Update private')},
    {value: 25, name: t('RSVP')},
    {value: 30, name: t('Write own')},
    {value: 35, name: t('Write all')},
    {value: 40, name: t('Delete')},
    {value: 50, name: t('Manage')}
];

export const VIEW_LEVELS = () => [
    {value: '', name: t('None')},
    {value: 10, name: t('Read')},
    {value: 30, name: t('Write')},
    {value: 50, name: t('Manage')}
];

/**
 * "Permissions" card of a FormWindow for an ACL entity (like the notes NoteBookDialog)
 * @param {GO.view.FormWindow} dialog
 * @param {String} entity
 * @param {Object[]} [levels]
 */
export function addShareCard(dialog, entity, levels) {
    dialog.addCard({
        header: {text: t('Permissions')},
        items : [{module: SharePanel, reference: 'sharePanel', levels: levels || null, flex: 1}]
    });

    dialog.on('formReady', async ({currentId}) => {
        const panel = dialog.getReference('sharePanel');

        await panel?.setEntity(entity, currentId || null).catch(e => console.error('SharePanel', e));

        // a new entity's default ACL arrives after the form took its unmodified state
        !currentId && panel && !dialog.isDestroyed && dialog.form.setOriginalValue('acl', panel.getSubmitValue())
    })
}
