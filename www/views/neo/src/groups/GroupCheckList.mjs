import EntityCheckList from '../form/field/EntityCheckList.mjs';
import client          from '../jmap/Client.mjs';
import {fmt, t}        from '../Translate.mjs';

/** member names shown per group (ExtJS: relation limit 5) */
const MEMBERS = 5;

/**
 * Groups to check (go.users.UserGroupGrid), value = group ids, field "groups" of a User.
 * Each row shows the first members; user groups show the user's avatar.
 *
 *     {module: GroupCheckList, jmapFilter: {excludeEveryone: true, hideUsers: true, groupMember: userId}}
 */
class GroupCheckList extends EntityCheckList {
    static config = {
        className : 'GO.groups.GroupCheckList',
        name      : 'groups',
        entity    : 'Group',
        properties: ['id', 'name', 'users', 'isUserGroupFor']
    }

    /** principal id → {name, avatarId} */
    principals = {}

    async prepare(list) {
        let me  = this,
            ids = new Set();

        list.forEach(g => {
            (g.users || []).slice(0, MEMBERS).forEach(id => ids.add(String(id)));
            g.isUserGroupFor && ids.add(String(g.isUserGroupFor))
        });

        const missing = [...ids].filter(id => !me.principals[id]);

        missing.length && (await client.get('Principal', missing, ['id', 'name', 'avatarId'])).forEach(p => {
            me.principals[String(p.id)] = p
        })
    }

    rowData(group) {
        let me      = this,
            users   = group.users || [],
            members = users.slice(0, MEMBERS).map(id => me.principals[String(id)]?.name).filter(Boolean).join(', '),
            more    = users.length - MEMBERS;

        more > 0 && (members += fmt(t(' and {count} more'), {count: more}));

        return {
            name       : String(group.name ?? ''),
            description: members,
            avatarId   : group.isUserGroupFor ? me.principals[String(group.isUserGroupFor)]?.avatarId : null
        }
    }
}

export default Neo.setupClass(GroupCheckList);
