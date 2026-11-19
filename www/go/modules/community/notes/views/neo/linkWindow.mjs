import {LEVEL_CREATE} from '../../../../../../views/neo/src/Acl.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';

/**
 * "Add link" → "Note" in another item's detail (GOUI Index.ts linkWindow): a new note in
 * the user's default note book, linked to the item once it is saved.
 * See ModuleRegistry `linkWindows`.
 *
 * @param {Object} ctx {appName, windowId, entity, entityId, record}
 * @returns {Promise<GO.notes.view.NoteDialog>}
 */
export default async function openLinkedNote({appName, windowId, entity, entityId}) {
    const [{default: NoteDialog}, user, {list: books}] = await Promise.all([
        import('./view/NoteDialog.mjs'),
        client.get('User', [client.user.id], ['notesSettings']).then(([u]) => u).catch(() => null),
        client.queryGet('NoteBook', {sort: [{property: 'name', isAscending: true}]})
    ]);

    const settings  = user?.notesSettings || {},
          writable  = books.filter(b => b.permissionLevel >= LEVEL_CREATE),
          defaultId = writable.find(b => String(b.id) === String(settings.defaultNoteBookId))?.id || writable[0]?.id || null,
          dialog    = Neo.create(NoteDialog, {
              appName,
              windowId,
              noteBooks  : writable,
              defaultType: settings.defaultType || 'html',
              values     : {name: '', noteBookId: defaultId, content: ''}
          });

    dialog.addLinkOnSave(entity, entityId);
    return dialog
}
