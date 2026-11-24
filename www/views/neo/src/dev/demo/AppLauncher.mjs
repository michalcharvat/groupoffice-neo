import Component    from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button       from '../../button/Button.mjs';
import BoolCheckBox from '../../form/field/BoolCheckBox.mjs';
import AppLauncher, {moduleIconUrl} from '../../view/AppLauncher.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * Dev demo: GO.view.AppLauncher (GO 6.8 start menu) with sample apps: module icons, Material
 * icons, a count, a classic-only app (titles are HTML: the caller escapes server text). The open / openBeside events are logged; with the
 * checkbox ticked an openBeside listener calls preventDefault(), so Shift+click opens nothing.
 */
class AppLauncherDemo extends Container {
    static config = {
        className: 'GO.dev.demo.AppLauncher',
        cls      : ['go-dev-page'],
        layout   : 'base',
        items    : [{
            module: Component,
            tag   : 'p',
            text  : 'The main menu of the header. Type to filter (name and title), Enter opens the first match, arrow keys move between the tiles, Escape or a click outside closes. Shift+click fires openBeside.'
        }, {
            module   : Button,
            reference: 'openButton',
            ui       : 'secondary',
            icon     : 'apps',
            text     : 'Open launcher'
        }, {
            module   : Button,
            reference: 'badgeButton',
            ui       : 'secondary',
            icon     : 'notifications',
            text     : 'Count on Notes +1'
        }, {
            module    : BoolCheckBox,
            reference : 'handleBeside',
            valueLabel: 'openBeside listener calls preventDefault()'
        }, {
            module   : Component,
            reference: 'output',
            tag      : 'pre',
            cls      : ['go-dev-output'],
            html     : ''
        }, {
            module   : AppLauncher,
            reference: 'launcher'
        }]
    }

    /** sample count on the notes tile */
    notesCount = 0

    onConstructed() {
        super.onConstructed();

        let me       = this,
            launcher = me.getReference('launcher');

        launcher.setApps([
            {name: 'notes',       title: 'Notes',        iconUrl: moduleIconUrl('community', 'notes')},
            {name: 'addressbook', title: 'Address book', iconUrl: moduleIconUrl('community', 'addressbook')},
            {name: 'calendar',    title: 'Calendar',     iconUrl: moduleIconUrl('community', 'calendar'), badge: '3'},
            {name: 'tasks',       title: 'Tasks',        iconUrl: moduleIconUrl('community', 'tasks')},
            {name: 'dev',         title: 'Dev',          icon: 'science'},
            {name: 'reports',     title: 'Reports',      icon: 'bar_chart', badge: '99+'},
            {name: 'legacyapp',   title: escapeHtml('Classic only <app>'), icon: 'history', classic: true, route: 'legacyapp'}
        ]);

        launcher.on('open', ({name, app}) => me.log(`open: ${name}${app.classic ? ' (classic, new tab)' : ''}`));
        launcher.on('openBeside', event => {
            me.log(`openBeside: ${event.name}`);
            me.getReference('handleBeside').checked && event.preventDefault()
        });

        me.getReference('openButton').handler = () => launcher.open(me.getReference('openButton').id);
        me.getReference('badgeButton').handler = () => launcher.setBadge('notes', String(++me.notesCount))
    }

    log(text) {
        const output = this.getReference('output');
        output.html = escapeHtml(text) + '\n' + output.html
    }
}

export default Neo.setupClass(AppLauncherDemo);
