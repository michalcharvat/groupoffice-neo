import {t} from '../util.mjs';

/**
 * Options of the contact import's column mapping (ExtJS MainPanel go.util.importFile()
 * options): lookup fields, aliases (CSV headers of common exports → properties) and labels.
 * Fixes of the ExtJS copy: "phoneNumbers" (was "phonenumbers") and the address property
 * "address" (was "street").
 * @returns {Object} {lookupFields, aliases, fields}
 */
export function contactImportOptions() {
    return {
        // These fields can be selected to update contacts if ID or e-mail matches
        lookupFields: {
            'id' : "ID",
            'email': 'E-mail',
            'debtorNumber': 'Debtor number',
            'registrationNumber': "Registration number"
        },

        // This hash map is used to aid in auto selecting the right mappings. Key is possible header in CSV and value is property name in Group-Office
        aliases : {
            "Given name": "firstName",
            "First name": "firstName",

            "Middle name": "middleName",

            "Family Name": "lastName",
            "Last Name": "lastName",

            "Job Title": "jobTitle",
            "Suffix": "suffixes",
            "Web page" : {field: "urls[].url", fixed: {"type": "homepage"}},
            "Birthday" : {field: "dates[].date", fixed: {"type": "birthday"}},
            "Anniversary" : {field: "dates[].date", fixed: {"type": "anniversary"}},

            "E-mail 1 - Value": {field: "emailAddresses[].email", related: {"type": "E-mail 1 - Type"}},
            "email": {field: "emailAddresses[].email", fixed: {"type": "work"}},
            "E-mail Address": {field: "emailAddresses[].email", fixed: {"type": "work"}},
            "E-mail 2 Address": {field: "emailAddresses[].email", fixed: {"type": "work"}},
            "E-mail 3 Address": {field: "emailAddresses[].email", fixed: {"type": "work"}},
            "E-mail": {field: "emailAddresses[].email", fixed: {"type": "work"}},

            "Primary Phone": {field: "phoneNumbers[].number", fixed: {"type": "work"}},
            "Home Phone": {field: "phoneNumbers[].number", fixed: {"type": "home"}},
            "Home Phone 2": {field: "phoneNumbers[].number", fixed: {"type": "home"}},

            "Business Phone": {field: "phoneNumbers[].number", fixed: {"type": "work"}},
            "Business Phone 2": {field: "phoneNumbers[].number", fixed: {"type": "work"}},

            "Mobile Phone": {field: "phoneNumbers[].number", fixed: {"type": "cell"}},
            "Pager": {field: "phoneNumbers[].number", fixed: {"type": "other"}},
            "Home Fax": {field: "phoneNumbers[].number", fixed: {"type": "fax"}},

            "Other Phone": {field: "phoneNumbers[].number", fixed: {"type": "other"}},
            "Other Fax": {field: "phoneNumbers[].number", fixed: {"type": "fax"}},

            "Home Street": {
                field: "addresses[].address",
                fixed: {type: "home"},
                related: {
                    city: "Home City",
                    state: "Home State",
                    zipCode: "Home Postal Code",
                    country: "Home Country"
                }
            },
            "Business Street": {
                field: "addresses[].address",
                fixed: {type: "work"},
                  related: {
                    city: "Business City",
                    state: "Business State",
                    zipCode: "Business Postal Code",
                    country: "Business Country"

                }
            },
            "Other Street": {
                field: "addresses[].address",
                fixed: {type: "other"},
                related: {
                    city: "Other City",
                    state: "Other State",
                    zipCode: "Other Postal Code",
                    country: "Other Country"

                }
            },

            "Company" : "organizations"
        },

        // Fields with labels and possible subproperties.
        // For example e-mail and type of an array of e-mail addresses should be grouped together.
        fields: {
            prefixes: {label: t("Prefixes")},
            initials: {label: t("Initials")},
            salutation: {label: t("Salutation")},
            color: {label: t("Color")},
            firstName: {label: t("First name")},
            middleName: {label: t("Middle name")},
            lastName: {label: t("Last name")},
            name: {label: t("Name")},
            suffixes: {label: t("Suffixes")},
            gender: {label: t("Gender")},
            notes: {label: t("Notes")},
            isOrganization: {label: t("Is organization")},
            IBAN: {label: t("IBAN")},
            registrationNumber: {label: t("Registration number")},
            vatNo: {label: t("VAT number")},
            vatReverseCharge: {label: t("Reverse charge VAT")},
            debtorNumber: {label: t("Debtor number")},
            photoBlobId: {label: t("Photo blob ID")},
            language: {label: t("Language")},
            jobTitle: {label: t("Job title")},
            uid: {label: t("UUID")},
            //starred: {label: t("Starred")},

            "emailAddresses": {
                label: t("E-mail addresses"),
                properties: {
                    "email": {label: "E-mail"},
                    "type": {label: t("Type")}
                }
            },

            "dates": {
                label: t("Dates"),
                properties: {
                    "date": {label: "Date"},
                    "type": {label: t("Type")}
                }
            },

            "phoneNumbers": {
                label: t("Phone numbers"),
                properties: {
                    "number": {label: "Number"},
                    "type": {label: t("Type")}
                }
            },

            "urls": {
                label: t("URL's"),
                properties: {
                    "url": {label: "URL"},
                    "type": {label: t("Type")}
                }
            },

            "addresses": {
                label: t("Addresses"),
                properties: {
                    "type": {label: t("Type")},
                    "address": {label: t("Street")},
                                "zipCode": {label: t("ZIP code")},
                    "city": {label: t("City")},
                    "state": {label: t("state")},
                    "country": {label: t("Country")},
                    "countryCode": {label: t("Country code")},
                    "latitude": {label: t("Latitude")},
                    "longitude": {label: t("Longitude")}
                }
            }

        }
    }
}
