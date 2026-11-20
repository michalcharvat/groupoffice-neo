import TextList     from '../../list/TextList.mjs';
import client       from '../../jmap/Client.mjs';
import {avatarHtml, escapeHtml} from '../../Format.mjs';

/**
 * Avatar of a principal: its picture, or the initials of its name
 * @param {Object} principal {name, avatarId}
 * @param {String[]} [cls=['go-avatar-small']]
 * @returns {String} HTML
 */
export function principalAvatarHtml(principal, cls=['go-avatar-small']) {
    const name = String(principal.name ?? '');

    return principal.avatarId
        ? `<img class="${['go-avatar', ...cls].join(' ')}" alt="" src="${escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(principal.avatarId) + '&w=64&h=64&zc=1')}">`
        : avatarHtml(name, cls)
}

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
        const name = String(record.name ?? '');

        return `${principalAvatarHtml(record)}<span class="go-principal-text"><span class="go-principal-name">${escapeHtml(name)}</span>`
            + (record.description ? `<span class="go-principal-description">${escapeHtml(record.description)}</span>` : '')
            + '</span>'
    }
}

export default Neo.setupClass(PrincipalList);
