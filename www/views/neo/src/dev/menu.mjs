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
    {id: 'draganddrop', text: 'Drag and drop', level: 0, status: 'done', demo: 'DragAndDrop', neo: 'GO.neo component/dragDrop.mjs enableDragDrop(), dropIndex() + addon WS/DragDrop; GO.tree.Tree dragNodes/dropOn/dropBetween',     goui: 'DragAndDrop.ts'},

    {id: 'component',     text: 'Components',     level: 0, header: true},
    {id: 'buttons',       text: 'Buttons',        level: 1, status: 'neo',  neo: 'GO.button.Button, SearchButton', goui: 'Button.ts'},
    {id: 'cardcontainer', text: 'Card container', level: 1, status: 'neo',  neo: 'neo layout card, tab/Container', goui: 'CardContainer.ts'},
    {id: 'datepicker',    text: 'DatePicker',     level: 1, status: 'done', demo: 'PeriodPickers', neo: 'neo component/DateSelector; GO.component.MonthPicker, WeekPicker', goui: 'DatePickerPage.ts'},
    {id: 'form',          text: 'Form',           level: 1, status: 'neo',  neo: 'GO.form.DataSourceForm',         goui: 'Form.ts'},

    {id: 'form/ArrayField',      text: 'ArrayField',         level: 2, status: 'done', demo: 'ArrayField', neo: 'GO.form.field.ArrayField', goui: 'form/ArrayFieldPage.ts'},
    {id: 'form/Autocomplete',    text: 'AutocompleteField',  level: 2, status: 'done', demo: 'Autocomplete', neo: 'GO.form.field.AutocompleteField', goui: 'goui/script/component/form/AutocompleteField.ts'},
    {id: 'form/CheckboxGroup',   text: 'CheckboxGroup',      level: 2, status: 'done', demo: 'CheckboxGroup', neo: 'GO.form.field.CheckboxGroup', goui: 'goui/script/component/form/CheckboxGroup.ts'},
    {id: 'form/ChecksAndRadios', text: 'Checks and Radios',  level: 2, status: 'neo',  neo: 'GO.component.CheckBox, neo Radio', goui: 'form/ChecksAndRadios.ts'},
    {id: 'form/ChipsField',      text: 'ChipsField',         level: 2, status: 'done', demo: 'Chips', neo: 'GO.form.field.ChipsField', goui: 'form/ChipsFieldPage.ts'},
    {id: 'form/ContainerField',  text: 'ContainerField',     level: 2, status: 'done', demo: 'ArrayField', neo: 'GO.form.field.ContainerField', goui: 'form/ContainerFieldPage.ts'},
    {id: 'form/DateTime',        text: 'Date and time',      level: 2, status: 'done', demo: 'DateTime', neo: 'GO.form.field.DateField, DateTimeField, DateRangeField, DurationField', goui: 'form/DateTimePage.ts'},
    {id: 'form/DisplayField',    text: 'DisplayField',       level: 2, status: 'neo',  neo: 'neo form/field/Display',  goui: 'form/DisplayFieldPage.ts'},
    {id: 'form/HtmlField',       text: 'HtmlField',          level: 2, status: 'done', demo: 'HtmlField', neo: 'GO.form.field.HtmlField', goui: 'form/HtmlFieldPage.ts'},
    {id: 'form/MarkdownField',   text: 'MarkdownField',      level: 2, status: 'done', demo: 'MarkdownField', neo: 'GO.form.field.MarkdownField, src/Markdown.mjs', goui: 'groupoffice-core/script/components/form/MarkdownField.ts'},
    {id: 'form/ListField',       text: 'ListField',          level: 2, status: 'done', demo: 'ListField', neo: 'GO.form.field.ListField', goui: 'goui/script/component/form/ListField.ts'},
    {id: 'form/MapField',        text: 'MapField',           level: 2, status: 'done', demo: 'MapField', neo: 'GO.form.field.MapField', goui: 'form/MapFieldPage.ts'},
    {id: 'form/NumberField',     text: 'NumberField',        level: 2, status: 'neo',  neo: 'neo form/field/Number',   goui: 'form/NumberFieldPage.ts'},
    {id: 'form/Select',          text: 'Select fields',      level: 2, status: 'done', demo: 'JmapCombo', neo: 'GO.form.field.JmapComboBox, PrincipalCombo, GroupCombo', goui: 'form/SelectPage.ts'},
    {id: 'form/TextField',       text: 'TextField',          level: 2, status: 'neo',  neo: 'neo form/field/Text, TextArea', goui: 'form/TextFieldPage.ts'},

    {id: 'menu/ColorMenu', text: 'ColorMenu', level: 1, status: 'done', demo: 'ColorMenu', neo: 'GO.menu.ColorMenu', goui: 'goui/script/component/menu/ColorMenu.ts'},
    {id: 'descriptionlist', text: 'DescriptionList', level: 1, status: 'done', demo: 'DescriptionList', neo: 'GO.component.DescriptionList', goui: 'DescriptionList.ts'},
    {id: 'list',     text: 'List',     level: 1, status: 'neo',  neo: 'GO.list.TextList, CheckList', goui: 'List.ts'},
    {id: 'panel',    text: 'Panel',    level: 1, status: 'neo',  neo: 'neo container/Panel',         goui: 'Panel.ts'},
    {id: 'patching', text: 'Patching', level: 1, status: 'neo',  neo: 'neo class overwrites (Neo.overwrites)', goui: 'Patching.ts'},
    {id: 'table',    text: 'Table',    level: 1, status: 'neo',  neo: 'GO.grid.Grid',                goui: 'Table.ts'},
    {id: 'table/MultiSelect', text: 'Multi select', level: 2, status: 'done', demo: 'MultiSelect', neo: 'GO.grid.Grid multiSelect, GO.grid.RowSelectionModel, MultiSelectToolbar', goui: 'table/MultiSelectToolbar.ts, RowSelect.ts'},
    {id: 'tooltip',  text: 'Tooltip',  level: 1, status: 'neo',  neo: 'neo tooltip/Base',            goui: 'TooltipPage.ts'},
    {id: 'tree',     text: 'Tree',     level: 1, status: 'done', demo: 'Tree', neo: 'GO.tree.Tree', goui: 'Tree.ts'},
    {id: 'window',   text: 'Window',   level: 1, status: 'neo',  neo: 'GO.view.Dialog, ConfirmDialog', goui: 'Window.ts'},

    {id: 'core',              text: 'Group-Office core', level: 0, header: true},
    {id: 'core/FormWindow',   text: 'FormWindow',        level: 1, status: 'done', demo: 'FormWindow',   neo: 'GO.view.FormWindow',           goui: 'groupoffice-core/script/components/FormWindow.ts'},
    {id: 'core/Links',        text: 'Links',             level: 1, status: 'done', demo: 'Links',        neo: 'src/link/*',                   goui: 'groupoffice-core/script/components/links/'},
    {id: 'core/CustomFields', text: 'Custom fields',     level: 1, status: 'done', demo: 'CustomFields', neo: 'src/customfields/*',           goui: 'groupoffice-core/script/customfields/'},
    {id: 'core/SharePanel',   text: 'SharePanel',        level: 1, status: 'done', demo: 'SharePanel',   neo: 'GO.permissions.SharePanel',    goui: 'groupoffice-core/script/permissions/SharePanel.ts'},
    {id: 'core/Templates',    text: 'E-mail / PDF templates', level: 1, status: 'done', demo: 'Templates', neo: 'GO.emailtemplate.EmailTemplateGrid, GO.pdftemplate.PdfTemplateGrid', goui: 'ExtJS go.emailtemplate, go.pdftemplate'},
    {id: 'core/Export',       text: 'Grid export',       level: 1, status: 'done', demo: 'GridExport', neo: 'src/export/exportEntities.mjs (exportMenuItem, exportEntities), MainThreeColumnPanel.exportMenuItem()', goui: 'ExtJS go.util.exportToFile, GOUI module Main "Export" menus'},
    {id: 'core/BatchEdit',    text: 'Batch edit',        level: 1, status: 'done', demo: 'GridExport', neo: 'GO.form.BatchEditDialog, GO.grid.BatchEditButton (MultiSelectToolbar)', goui: 'ExtJS go.form.BatchEditDialog'},
    {id: 'core/Recurrence',   text: 'RecurrenceField',   level: 1, status: 'done', demo: 'Recurrence', neo: 'GO.form.field.RecurrenceField', goui: 'groupoffice-core/script/components/form/RecurrenceField.ts'},
    {id: 'core/Upload',       text: 'Upload',            level: 1, status: 'done', demo: 'Upload', neo: 'GO.jmap.Uploader, GO.component.UploadPanel', goui: 'ExtJS go.Uploader, groupoffice-core/script/jmap/Client.ts upload()'},
    {id: 'core/Image',        text: 'Image zoom',        level: 1, status: 'done', demo: 'MarkdownField', neo: 'GO.view.ImageWindow, enableImageZoom()', goui: 'groupoffice-core/script/jmap/Image.ts'},
    {id: 'core/Mail',         text: 'showComposer',      level: 1, status: 'neo', neo: 'src/Mail.mjs showComposer(), e-mail module compose()', goui: 'ExtJS go.showComposer (go/core/views/extjs3/Mail.js)'},
    {id: 'core/Recipients',   text: 'RecipientPicker',   level: 1, status: 'done', demo: 'Recipients', neo: 'GO.form.field.RecipientsField, GO.view.RecipientPicker', goui: 'goui-docs/script/components/RecipientsField.ts, groupoffice-core/script/components/picker/RecipientPicker.ts'}
];
