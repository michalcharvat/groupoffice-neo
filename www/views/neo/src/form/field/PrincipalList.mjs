import TextList     from '../../list/TextList.mjs';
import client       from '../../jmap/Client.mjs';
import {avatarHtml, escapeHtml} from '../../Format.mjs';

/**
 * Picker list of PrincipalCombo: avatar, name and description (GOUI renders
 * <h3>name</h3><h4>description</h4>).
 */
class PrincipalList extends TextList {
    static config = {
        className: 'GO.form.field.PrincipalList',
        cls      : ['go-principal-list']
    }

    createItemContent(record) {
        const name   = String(record.name ?? ''),
              avatar = record.avatarId
                  ? `<img class="go-avatar go-avatar-small" alt="" src="${escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(record.avatarId) + '&w=64&h=64&zc=1')}">`
                  : avatarHtml(name, ['go-avatar-small']);

        return `${avatar}<span class="go-principal-text"><span class="go-principal-name">${escapeHtml(name)}</span>`
            + (record.description ? `<span class="go-principal-description">${escapeHtml(record.description)}</span>` : '')
            + '</span>'
    }
}

export default Neo.setupClass(PrincipalList);
