/**
 * Dev menu, mirrors the GOUI docs menu (goui-docs/script/MainMenu.ts) plus a
 * "Group-Office core" section for groupoffice-core components.
 *
 * id     route below "#dev/", also the GOUI docs route
 * demo   file in ./demo with a page for it (default export: neo container class)
 * status done = has a demo page, neo = neo.mjs or a GO class has it but no demo yet,
 *        todo = still to convert (see docs/neo-core-components.md)
 * neo    neo / GO class that covers it
 * goui   GOUI docs page (goui-docs/script/…) or GOUI source to convert from
 */
export default [
    {id: 'home',        text: 'Home',          level: 0, status: 'done'},
    {id: 'getstarted',  text: 'Get started',   level: 0, status: 'neo',  neo: 'views/neo/README.md',             goui: 'GetStarted.ts'},
    {id: 'layout',      text: 'Layout',        level: 0, status: 'neo',  neo: 'neo layout/* (hbox, vbox, card)', goui: 'Layout.ts'},
    {id: 'data',        text: 'Data',          level: 0, status: 'neo',  neo: 'GO.data.JmapStore',               goui: 'Data.ts'},
    {id: 'router',      text: 'Router',        level: 0, status: 'neo',  neo: 'MainView + module route()',       goui: 'Router.ts'},
    {id: 'draganddrop', text: 'Drag and drop', level: 0, status: 'neo',  neo: 'neo draggable/* (not wired)',     goui: 'DragAndDrop.ts'},

    {id: 'component',     text: 'Components',     level: 0, header: true},
    {id: 'buttons',       text: 'Buttons',        level: 1, status: 'neo',  neo: 'GO.button.Button, SearchButton', goui: 'Button.ts'},
    {id: 'cardcontainer', text: 'Card container', level: 1, status: 'neo',  neo: 'neo layout card, tab/Container', goui: 'CardContainer.ts'},
    {id: 'datepicker',    text: 'DatePicker',     level: 1, status: 'neo',  neo: 'neo component/DateSelector',     goui: 'DatePickerPage.ts'},
    {id: 'form',          text: 'Form',           level: 1, status: 'neo',  neo: 'GO.form.DataSourceForm',         goui: 'Form.ts'},

    {id: 'form/ArrayField',      text: 'ArrayField',         level: 2, status: 'todo', goui: 'form/ArrayFieldPage.ts'},
    {id: 'form/ChecksAndRadios', text: 'Checks and Radios',  level: 2, status: 'neo',  neo: 'GO.component.CheckBox, neo Radio', goui: 'form/ChecksAndRadios.ts'},
    {id: 'form/ChipsField',      text: 'ChipsField',         level: 2, status: 'todo', goui: 'form/ChipsFieldPage.ts'},
    {id: 'form/ContainerField',  text: 'ContainerField',     level: 2, status: 'todo', goui: 'form/ContainerFieldPage.ts'},
    {id: 'form/DateTime',        text: 'Date and time',      level: 2, status: 'todo', neo: 'neo Date, Time (no DateTime/DateRange/Duration)', goui: 'form/DateTimePage.ts'},
    {id: 'form/DisplayField',    text: 'DisplayField',       level: 2, status: 'neo',  neo: 'neo form/field/Display',  goui: 'form/DisplayFieldPage.ts'},
    {id: 'form/HtmlField',       text: 'HtmlField',          level: 2, status: 'done', demo: 'HtmlField', neo: 'GO.form.field.HtmlField', goui: 'form/HtmlFieldPage.ts'},
    {id: 'form/MapField',        text: 'MapField',           level: 2, status: 'todo', goui: 'form/MapFieldPage.ts'},
    {id: 'form/NumberField',     text: 'NumberField',        level: 2, status: 'neo',  neo: 'neo form/field/Number',   goui: 'form/NumberFieldPage.ts'},
    {id: 'form/Select',          text: 'Select fields',      level: 2, status: 'done', demo: 'JmapCombo', neo: 'GO.form.field.JmapComboBox, PrincipalCombo, GroupCombo', goui: 'form/SelectPage.ts'},
    {id: 'form/TextField',       text: 'TextField',          level: 2, status: 'neo',  neo: 'neo form/field/Text, TextArea', goui: 'form/TextFieldPage.ts'},

    {id: 'list',     text: 'List',     level: 1, status: 'neo',  neo: 'GO.list.TextList, CheckList', goui: 'List.ts'},
    {id: 'panel',    text: 'Panel',    level: 1, status: 'neo',  neo: 'neo container/Panel',         goui: 'Panel.ts'},
    {id: 'patching', text: 'Patching', level: 1, status: 'neo',  neo: 'neo class overwrites (Neo.overwrites)', goui: 'Patching.ts'},
    {id: 'table',    text: 'Table',    level: 1, status: 'neo',  neo: 'GO.grid.Grid',                goui: 'Table.ts'},
    {id: 'tooltip',  text: 'Tooltip',  level: 1, status: 'neo',  neo: 'neo tooltip/Base',            goui: 'TooltipPage.ts'},
    {id: 'tree',     text: 'Tree',     level: 1, status: 'todo', neo: 'neo tree/List (no lazy, checkable tree)', goui: 'Tree.ts'},
    {id: 'window',   text: 'Window',   level: 1, status: 'neo',  neo: 'GO.view.Dialog, ConfirmDialog', goui: 'Window.ts'},

    {id: 'core',              text: 'Group-Office core', level: 0, header: true},
    {id: 'core/FormWindow',   text: 'FormWindow',        level: 1, status: 'done', demo: 'FormWindow',   neo: 'GO.view.FormWindow',           goui: 'groupoffice-core/script/components/FormWindow.ts'},
    {id: 'core/Links',        text: 'Links',             level: 1, status: 'done', demo: 'Links',        neo: 'src/link/*',                   goui: 'groupoffice-core/script/components/links/'},
    {id: 'core/CustomFields', text: 'Custom fields',     level: 1, status: 'done', demo: 'CustomFields', neo: 'src/customfields/*',           goui: 'groupoffice-core/script/customfields/'},
    {id: 'core/SharePanel',   text: 'SharePanel',        level: 1, status: 'done', demo: 'SharePanel',   neo: 'GO.permissions.SharePanel',    goui: 'groupoffice-core/script/permissions/SharePanel.ts'},
    {id: 'core/Recurrence',   text: 'RecurrenceField',   level: 1, status: 'todo', goui: 'groupoffice-core/script/components/form/RecurrenceField.ts'},
    {id: 'core/Recipients',   text: 'RecipientPicker',   level: 1, status: 'todo', goui: 'goui-docs/script/components/RecipientsField.ts'}
];
