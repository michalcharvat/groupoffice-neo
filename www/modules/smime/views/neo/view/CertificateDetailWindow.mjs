import DescriptionList       from '../../../../../views/neo/src/component/DescriptionList.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import {formatUserDateTime}  from '../../../../../views/neo/src/Format.mjs';
import {t as coreT}          from '../../../../../views/neo/src/Translate.mjs';
import {t}                   from '../api.mjs';
import SmimeBar              from './SmimeBar.mjs';

/**
 * The details of a certificate (ExtJS GO.smime.CertificateDetailWindow): the verify verdict,
 * name, e-mail addresses, hash, serial number, version, issuer, validity and the OCSP status.
 *
 *     Neo.create(CertificateDetailWindow, {appName, windowId, certificate, result})
 */
class CertificateDetailWindow extends Dialog {
    static config = {
        className   : 'GO.smime.CertificateDetailWindow',
        cls         : ['go-smime-certificate-window'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('close'),
        title       : t('Certificate'),
        wrapperStyle: {
            height   : 'min(540px, 90vh)',
            left     : 'max(0px, calc(50vw - 340px))',
            maxHeight: '90vh',
            top      : 'max(5vh, calc(50vh - 270px))',
            width    : 'min(680px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * smime/publicCertificate/verify data
         * @member {Object} certificate={}
         */
        certificate: {},
        /**
         * checkCert() verdict {state, icon, text}, null for none (a stored certificate)
         * @member {Object|null} result=null
         */
        result: null
    }

    construct(config) {
        super.construct(config);

        let me     = this,
            cert   = me.certificate || {},
            issuer = cert.issuer || {},
            ocsp   = cert.ocspFound === false ? null : (cert.ocspMsg || (cert.ocsp ? 'OK' : null));

        me.items = [...me.result ? [{
            module  : SmimeBar,
            cls     : ['go-smime-bar', 'go-smime-' + me.result.state],
            iconName: me.result.icon,
            message : me.result.text
        }] : [], {
            ntype: 'container',
            cls  : ['go-scroll', 'go-smime-certificate-details'],
            flex : 1,
            items: [{
                module : DescriptionList,
                flex   : 'none',
                records: [
                    [coreT('Name'), cert.name],
                    [t('E-mail'), (cert.emails || []).join(', ')],
                    [t('Hash'), cert.hash],
                    [t('Serial number'), cert.serialNumber],
                    [t('Version'), cert.version],
                    [t('Issuer'), ['C', 'CN', 'L', 'O', 'ST'].filter(k => issuer[k]).map(k => `${k}: ${issuer[k]}`).join('; ')],
                    [t('Valid from'), cert.validFrom && formatUserDateTime(cert.validFrom.replace(' ', 'T'))],
                    [t('Valid to'), cert.validTo && formatUserDateTime(cert.validTo.replace(' ', 'T'))],
                    ['OCSP', ocsp]
                ]
            }]
        }]
    }
}

export default Neo.setupClass(CertificateDetailWindow);
