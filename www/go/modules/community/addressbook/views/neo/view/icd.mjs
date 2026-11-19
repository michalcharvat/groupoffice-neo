/**
 * Peppol ICD code list 8.8 (ExtJS ICDCombo.js, with its mis-encoded names fixed): the
 * ISO 6523 code, country and scheme name of the identifier schemes a contact's "ICD" can be
 * @type {Array[]} [[iso6523, country, scheme name, removed]]
 */
const ICD_LIST = [
    ["0002", "FR", "System Information et Repertoire des Entreprise et des Etablissements: SIRENE"],
    ["0007", "SE", "Organisationsnummer"],
    ["0009", "FR", "SIRET-CODE"],
    ["0037", "FI", "LY-tunnus"],
    ["0060", "international", "Data Universal Numbering System (D-U-N-S Number)"],
    ["0088", "international", "Global Location Number"],
    ["0096", "DK", "The Danish Business Authority - P-number (DK:P)"],
    ["0097", "IT", "FTI - Ediforum Italia"],
    ["0106", "NL", "Vereniging van Kamers van Koophandel en Fabrieken in Nederland (Association of\nChambers of Commerce and Industry in the Netherlands), Scheme"],
    ["0130", "international", "Directorates of the European Commission"],
    ["0135", "IT", "SIA Object Identifiers"],
    ["0142", "IT", "SECETI Object Identifiers"],
    ["0151", "AU", "Australian Business Number (ABN) Scheme"],
    ["0183", "CH", "Swiss Unique Business Identification Number (UIDB)"],
    ["0184", "DK", "The Danish Business Authority - CVR-number (DK:CVR)"],
    ["0188", "JP", "Corporate Number of The Social Security and Tax Number System"],
    ["0190", "NL", "Organisatie-identificatienummer (OIN)"],
    ["0191", "EE", "Company code"],
    ["0192", "NO", "Organisasjonsnummer"],
    ["0193", "BE", "UBL.BE Party Identifier"],
    ["0195", "SG", "Singapore Nationwide E-Invoice Framework"],
    ["0196", "IS", "Icelandic identifier"],
    ["0198", "DK", "The Danish Business Authority - SE-number (DK:SE)"],
    ["0199", "international", "Legal Entity Identifier (LEI)"],
    ["0200", "LT", "Legal entity code"],
    ["0201", "IT", "Codice Univoco Unità Organizzativa iPA"],
    ["0204", "DE", "Peppol-Leitweg-ID"],
    ["0205", "IT", "CODDEST"],
    ["0208", "BE", "Numero d'entreprise / ondernemingsnummer / Unternehmensnummer"],
    ["0209", "international", "GS1 identification keys"],
    ["0210", "IT", "CODICE FISCALE"],
    ["0211", "IT", "PARTITA IVA"],
    ["0212", "FI", "Finnish Organization Identifier"],
    ["0213", "FI", "Finnish Organization Value Add Tax Identifier"],
    ["0215", "FI", "Net service ID"],
    ["0216", "FI", "OVTcode"],
    ["0218", "LV", "Unified registration number"],
    ["0221", "JP", "The registered number of the qualified invoice issuer"],
    ["0230", "MY", "National e-Invoicing Framework"],
    ["9901", "DK", "Danish Ministry of the Interior and Health", true],
    ["9902", "DK", "The Danish Commerce and Companies Agency", true],
    ["9904", "DK", "Danish Ministry of Taxation, Central Customs and Tax Administration", true],
    ["9905", "DK", "Danish VANS providers", true],
    ["9906", "IT", "Ufficio responsabile gestione partite IVA", true],
    ["9907", "IT", "TAX Authority", true],
    ["9908", "NO", "Enhetsregisteret ved Bronnoysundregisterne", true],
    ["9909", "NO", "Norwegian VAT number"],
    ["9910", "HU", "Hungary VAT number"],
    ["9912", "international", "National ministries of Economy"],
    ["9913", "international", "Business Registers Network"],
    ["9914", "AT", "Österreichische Umsatzsteuer-Identifikationsnummer"],
    ["9915", "AT", "Österreichisches Verwaltungs bzw. Organisationskennzeichen"],
    ["9916", "AT", "Firmenidentifikationsnummer der Statistik Austria"],
    ["9917", "IS", "Icelandic National Registry"],
    ["9918", "international", "SOCIETY FOR WORLDWIDE INTERBANK FINANCIAL, TELECOMMUNICATION S.W.I.F.T"],
    ["9919", "AT", "Kennziffer des Unternehmensregisters"],
    ["9920", "ES", "Agencia Española de Administración Tributaria"],
    ["9921", "IT", "Indice delle Pubbliche Amministrazioni", true],
    ["9922", "AD", "Andorra VAT number"],
    ["9923", "AL", "Albania VAT number"],
    ["9924", "BA", "Bosnia and Herzegovina VAT number"],
    ["9925", "BE", "Belgium VAT number"],
    ["9926", "BG", "Bulgaria VAT number"],
    ["9927", "CH", "Switzerland VAT number"],
    ["9928", "CY", "Cyprus VAT number"],
    ["9929", "CZ", "Czech Republic VAT number"],
    ["9930", "DE", "Germany VAT number"],
    ["9931", "EE", "Estonia VAT number"],
    ["9932", "GB", "United Kingdom VAT number"],
    ["9933", "GR", "Greece VAT number"],
    ["9934", "HR", "Croatia VAT number"],
    ["9935", "IE", "Ireland VAT number"],
    ["9936", "LI", "Liechtenstein VAT number"],
    ["9937", "LT", "Lithuania VAT number"],
    ["9938", "LU", "Luxemburg VAT number"],
    ["9939", "LV", "Latvia VAT number"],
    ["9940", "MC", "Monaco VAT number"],
    ["9941", "ME", "Montenegro VAT number"],
    ["9942", "MK", "Macedonia, the former Yugoslav Republic of VAT number"],
    ["9943", "MT", "Malta VAT number"],
    ["9944", "NL", "Netherlands VAT number"],
    ["9945", "PL", "Poland VAT number"],
    ["9946", "PT", "Portugal VAT number"],
    ["9947", "RO", "Romania VAT number"],
    ["9948", "RS", "Serbia VAT number"],
    ["9949", "SI", "Slovenia VAT number"],
    ["9950", "SK", "Slovakia VAT number"],
    ["9951", "SM", "San Marino VAT number"],
    ["9952", "TR", "Turkey VAT number"],
    ["9953", "VA", "Holy See (Vatican City State) VAT number"],
    ["9954", "NL", "Dutch Originator's Identification Number"],
    ["9955", "SE", "Swedish VAT number", true],
    ["9956", "BE", "Belgian Crossroad Bank of Enterprise number", true],
    ["9957", "FR", "French VAT number"],
    ["9958", "DE", "Peppol-Leitweg-ID", true],
    ["9959", "US", "US Employer ID Number"]
];

/**
 * ICD options of a country and the international schemes (GLN, D-U-N-S, ...; ExtJS
 * listed only the country's), without removed schemes (ExtJS listed them too, e.g.
 * "Peppol-Leitweg-ID" twice), plus the given value when it is another country's or
 * removed (it stays visible), as LocalCombo data
 * @param {String|null} countryCode
 * @param {String|null} [value]
 * @returns {Object[]} [{id, name}]
 */
export function icdOptions(countryCode, value = null) {
    const options = ICD_LIST
        .filter(([id, country, , removed]) => (value && id === value) || (!removed && (country === 'international' || (countryCode && country === countryCode))))
        .map(([id, , name]) => ({id, name}));

    // a code that is not in the list stays, shown as the code
    value && !options.some(o => o.id === value) && options.push({id: value, name: value});

    return options
}
