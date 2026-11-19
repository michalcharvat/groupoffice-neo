import EntityCheckList from '../form/field/EntityCheckList.mjs';
import {fmt, t}        from '../Translate.mjs';
import Dialog, {headerTools} from '../view/Dialog.mjs';

/**
 * All members of a group with a search (ExtJS go.groups.GroupMemberWindow), opened from
 * the "View members" button of a GO.permissions.SharePanel row.
 *
 *     GroupMemberDialog.show({appName, windowId, groupId, groupName})
 */
class GroupMemberDialog extends Dialog {
    static config = {
        className   : 'GO.groups.GroupMemberDialog',
        cls         : ['go-group-member-dialog'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('close'),
        title       : '',
        wrapperStyle: {
            height   : '600px',
            left     : 'max(0px, calc(50vw - 300px))',
            maxHeight: '90vh',
            maxWidth : '100vw',
            top      : 'max(5vh, calc(50vh - 300px))',
            width    : '600px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Number|String|null} groupId=null
         */
        groupId: null,
        /**
         * Shown in the title
         * @member {String} groupName=''
         */
        groupName: ''
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = me.groupName ? fmt('{0}: {1}', [t('Members'), me.groupName]) : t('Members');
        me.items = [{
            module    : EntityCheckList,
            reference : 'list',
            flex      : 1,
            checkable : false,
            entity    : 'Principal',
            properties: ['id', 'name', 'description', 'avatarId'],
            jmapFilter: {groupId: me.groupId}
        }]
    }

    /**
     * @param {Object} config appName, windowId, groupId, groupName
     * @returns {GO.groups.GroupMemberDialog}
     */
    static show(config) {
        return Neo.create(GroupMemberDialog, config)
    }
}

export default Neo.setupClass(GroupMemberDialog);
