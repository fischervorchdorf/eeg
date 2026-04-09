/**
 * PDF-Preview eines Antrags vor Absendung
 */
const PDFDocument = require('pdfkit');

function generatePreviewPdf(application, zaehlpunkte, eegName) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    return new Promise((resolve, reject) => {
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const a = application;

        // Header
        doc.fontSize(18).font('Helvetica-Bold').text(`Beitritt: ${eegName}`, { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').fillColor('#888').text(`Antrags-ID: ${a.id} | Erstellt am: ${new Date().toLocaleDateString('de-AT')}`, { align: 'center' });
        doc.fillColor('#000').moveDown(1);

        // Section helper
        const section = (title) => {
            doc.moveDown(0.5);
            doc.fontSize(13).font('Helvetica-Bold').fillColor('#2d5a3d').text(title);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#2d5a3d').stroke();
            doc.fillColor('#000').moveDown(0.3);
        };

        const field = (label, value) => {
            if (value === null || value === undefined || value === '') return;
            doc.fontSize(10).font('Helvetica-Bold').text(label + ': ', { continued: true });
            doc.font('Helvetica').text(String(value));
        };

        // Persoenliche Daten
        section('Persoenliche Daten');
        if (a.firmenname) field('Firma', a.firmenname);
        if (a.uid_nummer) field('UID-Nummer', a.uid_nummer);
        if (a.firmenbuchnummer) field('Firmenbuchnummer', a.firmenbuchnummer);
        field('Name', `${a.titel || ''} ${a.vorname || ''} ${a.nachname || ''}`.trim());
        field('Adresse', `${a.strasse || ''} ${a.hausnummer || ''}, ${a.plz || ''} ${a.ort || ''}`.trim());
        field('Geburtsdatum', a.geburtsdatum ? new Date(a.geburtsdatum).toLocaleDateString('de-AT') : null);
        field('Identifikation', a.ausweis_typ);
        field('Ausweisnummer', a.ausweisnummer);
        field('Telefon', a.telefon);
        field('E-Mail', a.email + (a.email_verified ? ' (bestaetigt)' : ''));

        // Zaehlpunkte
        section('Zaehlpunkte');
        const bezug = zaehlpunkte.filter(z => z.typ === 'bezug');
        const einspeisung = zaehlpunkte.filter(z => z.typ === 'einspeisung');

        if (bezug.length > 0) {
            doc.fontSize(11).font('Helvetica-Bold').text('Bezugs-Zaehlpunkte:');
            doc.font('Helvetica').fontSize(10);
            bezug.forEach((z, i) => {
                doc.text(`  ${i + 1}. ${z.zaehlpunktnummer}`);
                if (z.strasse || z.ort) doc.text(`     ${z.strasse || ''} ${z.hausnummer || ''}, ${z.plz || ''} ${z.ort || ''}`.trim());
                if (z.jahresverbrauch_kwh) doc.text(`     Jahresverbrauch: ${z.jahresverbrauch_kwh} kWh`);
            });
            doc.moveDown(0.3);
        }

        if (einspeisung.length > 0) {
            doc.fontSize(11).font('Helvetica-Bold').text('Einspeise-Zaehlpunkte:');
            doc.font('Helvetica').fontSize(10);
            einspeisung.forEach((z, i) => {
                doc.text(`  ${i + 1}. ${z.zaehlpunktnummer}`);
                if (z.pv_leistung_kwp) doc.text(`     PV-Leistung: ${z.pv_leistung_kwp} kWp`);
                if (z.rueckspeise_limitierung) doc.text(`     Rueckspeise-Limit: ${z.rueckspeise_limitierung} kW`);
            });
        }

        // Zahlung
        section('Zahlungsinformationen');
        field('Kontoinhaber/in', a.kontoinhaber);
        field('IBAN', a.iban ? a.iban.replace(/(.{4})/g, '$1 ').trim() : null);
        field('Bank', a.bankname);
        field('SEPA-Lastschriftmandat', a.sepa_akzeptiert ? 'akzeptiert' : 'nicht akzeptiert');

        // Bestaetigungen
        section('Bestaetigungen');
        const yn = (v) => v ? '[X] akzeptiert' : '[ ] NICHT akzeptiert';
        doc.fontSize(10);
        doc.text(`${yn(a.statuten_akzeptiert)}  Statuten`);
        doc.text(`${yn(a.agb_akzeptiert)}  AGB`);
        doc.text(`${yn(a.datenschutz_akzeptiert)}  Datenschutzerklaerung`);
        doc.text(`${yn(a.netzbetreiber_vollmacht)}  Netzbetreibervollmacht`);
        if (a.kundennummer_netzbetreiber) field('Kundennummer Netzbetreiber', a.kundennummer_netzbetreiber);

        // Footer
        doc.moveDown(2);
        doc.fontSize(8).fillColor('#888')
            .text('Dies ist eine Vorschau Ihres Beitrittsantrags. Bitte ueberpruefen Sie alle Angaben sorgfaeltig vor der Absendung.', { align: 'center' });

        doc.end();
    });
}

module.exports = { generatePreviewPdf };
