const ExcelJS = require('exceljs');

/**
 * Erstellt eine Excel-Datei mit Mitgliederdaten
 */
async function createMemberExport(members, options = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EEG-Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Mitglieder');

    // Standard-Spalten
    const columns = [
        { header: 'Nr.', key: 'nr', width: 6 },
        { header: 'Typ', key: 'typ', width: 15 },
        { header: 'Titel', key: 'titel', width: 8 },
        { header: 'Vorname', key: 'vorname', width: 18 },
        { header: 'Nachname', key: 'nachname', width: 18 },
        { header: 'Firmenname', key: 'firmenname', width: 22 },
        { header: 'Strasse', key: 'strasse', width: 25 },
        { header: 'Nr.', key: 'hausnummer', width: 6 },
        { header: 'PLZ', key: 'plz', width: 8 },
        { header: 'Ort', key: 'ort', width: 18 },
        { header: 'E-Mail', key: 'email', width: 28 },
        { header: 'Telefon', key: 'telefon', width: 18 },
        { header: 'Geburtsdatum', key: 'geburtsdatum', width: 14 },
        { header: 'IBAN', key: 'iban', width: 26 },
        { header: 'Kontoinhaber', key: 'kontoinhaber', width: 22 },
        { header: 'Bankname', key: 'bankname', width: 20 },
        { header: 'Zaehlpunkte Bezug', key: 'zp_bezug', width: 40 },
        { header: 'Zaehlpunkte Einspeisung', key: 'zp_einspeisung', width: 40 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Eingereicht am', key: 'eingereicht_am', width: 16 },
        { header: 'Genehmigt am', key: 'genehmigt_am', width: 16 }
    ];

    // Spaltenfilter anwenden
    if (options.columns && options.columns.length > 0) {
        sheet.columns = columns.filter(c => options.columns.includes(c.key));
    } else {
        sheet.columns = columns;
    }

    // Header-Styling
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A73E8' }
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Daten einfuegen
    members.forEach((member, idx) => {
        sheet.addRow({
            nr: idx + 1,
            typ: member.member_type || '',
            titel: member.titel || '',
            vorname: member.vorname || '',
            nachname: member.nachname || '',
            firmenname: member.firmenname || '',
            strasse: member.strasse || '',
            hausnummer: member.hausnummer || '',
            plz: member.plz || '',
            ort: member.ort || '',
            email: member.email || '',
            telefon: member.telefon || '',
            geburtsdatum: member.geburtsdatum ? new Date(member.geburtsdatum).toLocaleDateString('de-AT') : '',
            iban: member.iban || '',
            kontoinhaber: member.kontoinhaber || '',
            bankname: member.bankname || '',
            zp_bezug: member.zp_bezug || '',
            zp_einspeisung: member.zp_einspeisung || '',
            status: member.status || '',
            eingereicht_am: member.eingereicht_am ? new Date(member.eingereicht_am).toLocaleDateString('de-AT') : '',
            genehmigt_am: member.genehmigt_am ? new Date(member.genehmigt_am).toLocaleDateString('de-AT') : ''
        });
    });

    // Auto-Filter
    sheet.autoFilter = {
        from: 'A1',
        to: `${String.fromCharCode(64 + sheet.columns.length)}1`
    };

    return workbook;
}

/**
 * Erstellt Digi-Taler CSV-Export
 */
async function createDigiTalerExport(members) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Digi-Taler');

    sheet.columns = [
        { header: 'Vorname', key: 'vorname', width: 18 },
        { header: 'Nachname', key: 'nachname', width: 18 },
        { header: 'E-Mail', key: 'email', width: 28 },
        { header: 'IBAN', key: 'iban', width: 26 },
        { header: 'Betrag EUR', key: 'betrag_eur', width: 14 },
        { header: 'Betrag DigiTaler', key: 'betrag_digi', width: 16 },
        { header: 'Anteil DigiTaler %', key: 'anteil_digi', width: 18 }
    ];

    sheet.getRow(1).font = { bold: true };

    members.forEach(m => {
        sheet.addRow({
            vorname: m.vorname || '',
            nachname: m.nachname || '',
            email: m.email || '',
            iban: m.iban || '',
            betrag_eur: m.betrag_eur || 0,
            betrag_digi: m.betrag_digi || 0,
            anteil_digi: m.anteil_digi || 0
        });
    });

    return workbook;
}

module.exports = { createMemberExport, createDigiTalerExport };
