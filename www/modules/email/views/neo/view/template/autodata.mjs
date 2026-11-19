import {t} from '../../util.mjs';

/**
 * Tags of the template editor's "Autodata" panel (ExtJS EmailTemplateDialog): replaced when
 * the template is used (GO\Base\Model\Template::replace…) with the recipient contact's,
 * the user's or other values.
 */
const CONTACT = [
    ['salutation', 'Salutation'], ['first_name', 'First name'], ['middle_name', 'Middle name'],
    ['last_name', 'Last name'], ['initials', 'Initials'], ['title', 'Title'], ['email', 'E-mail'],
    ['home_phone', 'Phone'], ['fax', 'Fax'], ['cellular', 'Mobile'], ['cellular2', '2nd mobile'],
    ['address', 'Address'], ['address_no', 'Address 2'], ['zip', 'ZIP/Postal'], ['city', 'City'],
    ['state', 'State'], ['country', 'Country'], ['company', 'Company'], ['department', 'Department'],
    ['function', 'Function'], ['work_phone', 'Phone (work)'], ['work_fax', 'Fax (work)'],
    ['work_address', 'Address (work)'], ['work_address_no', 'Address 2 (work)'], ['work_city', 'City (work)'],
    ['work_zip', 'ZIP/Postal (work)'], ['work_state', 'State (work)'], ['work_country', 'Country (work)'],
    ['work_post_address', 'Address (post)'], ['work_post_address_no', 'Number of house (post)'],
    ['work_post_city', 'City (post)'], ['work_post_zip', 'ZIP/Postal (post)'], ['work_post_state', 'State (post)'],
    ['work_post_country', 'Country (post)'], ['homepage', 'Homepage']
];

const USER = [
    ['user:name', 'Name'], ['user:first_name', 'First name'], ['user:middle_name', 'Middle name'],
    ['user:last_name', 'Last name'], ['user:initials', 'Initials'], ['user:title', 'Title'], ['user:email', 'E-mail'],
    ['user:home_phone', 'Phone'], ['user:fax', 'Fax'], ['user:work_phone', 'Phone (work)'], ['user:work_fax', 'Fax (work)'],
    ['user:cellular', 'Mobile'], ['user:cellular2', '2nd mobile'], ['user:address', 'Address'], ['user:address_no', 'Address 2'],
    ['user:zip', 'ZIP/Postal'], ['user:city', 'City'], ['user:state', 'State'], ['user:country', 'Country'],
    ['usercompany:name', 'Company'], ['user:department', 'Department'], ['user:function', 'Function'],
    ['usercompany:phone', 'Phone (work)'], ['usercompany:fax', 'Fax (work)'], ['usercompany:address', 'Address (work)'],
    ['usercompany:address_no', 'Address 2 (work)'], ['usercompany:city', 'City (work)'], ['usercompany:zip', 'ZIP/Postal (work)'],
    ['usercompany:state', 'State (work)'], ['usercompany:country', 'Country (work)'], ['user:homepage', 'Homepage']
];

/**
 * Menu items of the "Autodata" button: submenus of the contact's and the user's fields, then
 * the other tags
 * @param {Function} insert (tag) => void
 * @returns {Object[]} GO.menu.List items
 */
export function autodataMenu(insert) {
    const item    = (tag, text) => ({text, handler: () => insert(tag)}),
          contact = list => list.map(([key, text]) => item(`{contact:${key}}`, t(text))),
          user    = list => list.map(([key, text]) => item(`{${key}}`, t(text))),
          isWork  = ([key]) => key.startsWith('work_'),
          isUser  = ([key]) => key.startsWith('user:');

    // short submenus: a long one would run off the screen
    return [
        {text: t('Contact'), icon: 'person', items: contact(CONTACT.filter(f => !isWork(f)))},
        {text: `${t('Contact')} (${t('Work')})`, icon: 'work', items: contact(CONTACT.filter(isWork))},
        {text: t('User'), icon: 'badge', items: user(USER.filter(isUser))},
        {text: `${t('Company')} (${t('User')})`, icon: 'business', items: user(USER.filter(f => !isUser(f)))},
        {separator: true},
        item('{date}', t('Date')),
        item('{link}', t('Link')),
        item('{unsubscribe_link}', t('Unsubscribe link')),
        item('%unsubscribe_href%', t('Unsubscribe href'))
    ]
}
