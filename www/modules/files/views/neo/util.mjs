/**
 * Helpers of the files module's neo UI
 */

/** Material icon per file extension (ExtJS filetype-<ext> classes) */
const ICONS = {
    folder: 'folder',
    pdf   : 'picture_as_pdf',
    zip: 'folder_zip', tar: 'folder_zip', tgz: 'folder_zip', gz: 'folder_zip', rar: 'folder_zip', '7z': 'folder_zip',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', bmp: 'image', svg: 'image', webp: 'image', heic: 'image', tif: 'image', tiff: 'image',
    mp3: 'audio_file', wav: 'audio_file', ogg: 'audio_file', flac: 'audio_file', m4a: 'audio_file',
    mp4: 'video_file', mov: 'video_file', avi: 'video_file', webm: 'video_file', ogv: 'video_file', mkv: 'video_file',
    xls: 'table_chart', xlsx: 'table_chart', ods: 'table_chart', csv: 'table_chart',
    ppt: 'slideshow', pptx: 'slideshow', odp: 'slideshow',
    doc: 'article', docx: 'article', odt: 'article', rtf: 'article', txt: 'article', md: 'article',
    html: 'code', htm: 'code', xml: 'code', json: 'code', js: 'code', php: 'code', css: 'code',
    eml: 'mail', msg: 'mail', ics: 'event', vcf: 'contact_page'
};

/**
 * @param {Object} record list record
 * @returns {Boolean}
 */
export function isFolder(record) {
    return record?.extension === 'folder' || String(record?.type_id || '').startsWith('d:')
}

/**
 * Material icon of a list record (a shared folder gets folder_shared like ExtJS)
 * @param {Object} record
 * @returns {String}
 */
export function fileIcon(record) {
    if (isFolder(record)) {
        return record.acl_id > 0 && !+record.readonly ? 'folder_shared' : 'folder'
    }

    return ICONS[String(record?.extension || '').toLowerCase()] || 'description'
}

// moved to core: the legacy controllers of other modules encode their values too
import {decodeEntities} from '../../../../views/neo/src/Format.mjs';
export {decodeEntities};

/**
 * Material icon of a tree node from its ExtJS iconCls
 * @param {String} iconCls
 * @returns {String}
 */
export function treeIcon(iconCls) {
    return {
        'ic-home'         : 'home',
        'ic-folder-shared': 'folder_shared',
        'ic-delete'       : 'delete',
        'ic-folder'       : 'folder'
    }[iconCls] || 'folder'
}

/**
 * A node of the legacy tree controller (files/folder/tree) as GO.tree.Tree node. With
 * showFiles the controller adds file nodes (leaf, checked): their ids would collide with
 * folder ids, so they become "f:<id>".
 * @param {Object} n ExtJS tree node
 * @returns {Object} GO.tree.Tree node
 */
export function toTreeNode(n) {
    const children = Array.isArray(n.children) ? n.children.map(c => toTreeNode(c)) : undefined;

    // file nodes carry raw names and paths (_addFileNodes()), unlike the folder nodes
    if (n.leaf) {
        return {
            id       : 'f:' + n.id,
            fileId   : String(n.id),
            text     : String(n.text ?? ''),
            icon     : fileIcon(n),
            children : [],
            check    : false,
            path     : n.path,
            size     : n.size,
            extension: n.extension,
            draggable: false
        }
    }

    return {
        id       : String(n.id),
        text     : decodeEntities(n.text),
        icon     : treeIcon(n.iconCls),
        children,
        expanded : !!n.expanded && !!children?.length,
        path     : n.path,
        parentId : n.parent_id,
        readonly : !!n.readonly,
        allowDrop: n.allowDrop !== false,
        draggable: !!n.draggable
    }
}

/**
 * Invalid file / folder name (ExtJS NewFolderDialog validator)
 * @param {String} name
 * @returns {Boolean}
 */
export function isValidName(name) {
    return !!name && !/[&/:*?"<>|\\]/.test(name) && !/[ .]$/.test(name)
}

// moved to the core DateUtil: the start page uses it too
export {userDateToYmd} from '../../../../views/neo/src/DateUtil.mjs';

/**
 * name and extension of a new file name for files/file/submit. The controller appends
 * "." + extension whenever `extension` is sent: without a dot it is left out, so the
 * file keeps its extension (like ExtJS)
 * @param {String} fileName
 * @returns {{name: String, extension?: String}}
 */
export function splitFileName(fileName) {
    const dot = fileName.lastIndexOf('.');
    return dot > 0 ? {name: fileName.slice(0, dot), extension: fileName.slice(dot + 1)} : {name: fileName}
}
