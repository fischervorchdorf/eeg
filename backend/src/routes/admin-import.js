/**
 * Import-Route fuer Mitgliederdaten
 * Unterstuetzt Excel (.xlsx) und CSV
 * 2-Schritt-Prozess: Preview -> Execute
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const pool = require('../config/db');
const { requireLogin, requirePermission } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');

router.use(requireLogin);
router.use(requireEegAccess);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel', 'text/csv', 'text/plain',
                    'application/csv', 'application/octet-stream'].includes(file.mimetype)
                || file.originalname.match(/\.(xlsx|csv)$/i);
        cb(null, !!ok);
    }
});

// Unser Ziel-Schema mit Beschreibungen
const FIELD_DEFS = [
    { key: 'skip',              label: '— ignorieren —' },
    { key: 'mitgliedstyp',      label: 'Mitgliedstyp (Privatperson/Unternehmen/Landwirtschaft)' },
    { key: 'titel',             label: 'Titel (Mag., Dr., ...)' },
    { key: 'vorname',           label: 'Vorname' },
    { key: 'nachname',          label: 'Nachname' },
    { key: 'postname',          label: 'Postnomen' },
    { key: 'firmenname',        label: 'Firmenname / Firmenwortlaut' },
    { key: 'uid_nummer',        label: 'UID-Nummer' },
    { key: 'firmenbuchnummer',  label: 'Firmenbuch- / ZVR-Nummer' },
    { key: 'geburtsdatum',      label: 'Geburtsdatum' },
    { key: 'strasse',           label: 'Straße' },
    { key: 'hausnummer',        label: 'Hausnummer' },
    { key: 'plz',               label: 'PLZ' },
    { key: 'ort',               label: 'Ort' },
    { key: 'telefon',           label: 'Telefon' },
    { key: 'email',             label: 'E-Mail' },
    { key: 'iban',              label: 'IBAN' },
    { key: 'kontoinhaber',      label: 'Kontoinhaber' },
    { key: 'bankname',          label: 'Name der Bank' },
    { key: 'zaehlpunkt_bezug',  label: 'Zählpunktnummer Bezug' },
    { key: 'zaehlpunkt_einspeisung', label: 'Zählpunktnummer Einspeisung' },
    { key: 'pv_leistung_kwp',   label: 'PV-Leistung (kWp)' },
    { key: 'jahresverbrauch_kwh', label: 'Jahresverbrauch (kWh)' },
    { key: 'status',            label: 'Status (aktiv/genehmigt/...)' },
    { key: 'genehmigt_am',      label: 'Beitrittsdatum / Genehmigt am' },
];

// Auto-Mapping: erkennt Spaltenname -> Feld
const AUTO_MAP = {
    'vorname': 'vorname', 'first name': 'vorname', 'firstname': 'vorname',
    'nachname': 'nachname', 'last name': 'nachname', 'lastname': 'nachname', 'familienname': 'nachname',
    'titel': 'titel', 'title': 'titel',
    'postname': 'postname', 'postnomen': 'postname',
    'firmenname': 'firmenname', 'firma': 'firmenname', 'firmenwortlaut': 'firmenname', 'unternehmen': 'firmenname', 'company': 'firmenname',
    'uid': 'uid_nummer', 'uid-nummer': 'uid_nummer', 'ust-id': 'uid_nummer', 'ust id': 'uid_nummer',
    'firmenbuch': 'firmenbuchnummer', 'zvr': 'firmenbuchnummer', 'fb-nummer': 'firmenbuchnummer',
    'geburtsdatum': 'geburtsdatum', 'geburtstag': 'geburtsdatum', 'birthday': 'geburtsdatum',
    'strasse': 'strasse', 'straße': 'strasse', 'street': 'strasse', 'adresse': 'strasse',
    'hausnummer': 'hausnummer', 'hnr': 'hausnummer', 'nr': 'hausnummer',
    'plz': 'plz', 'postleitzahl': 'plz', 'postal code': 'plz', 'zip': 'plz',
    'ort': 'ort', 'city': 'ort', 'gemeinde': 'ort', 'wohnort': 'ort',
    'telefon': 'telefon', 'tel': 'telefon', 'phone': 'telefon', 'mobilnummer': 'telefon', 'handy': 'telefon',
    'email': 'email', 'e-mail': 'email', 'mail': 'email',
    'iban': 'iban', 'bankverbindung': 'iban',
    'kontoinhaber': 'kontoinhaber', 'kontoinhaber*in': 'kontoinhaber',
    'bank': 'bankname', 'bankname': 'bankname', 'bankinstitut': 'bankname',
    'zählpunkt': 'zaehlpunkt_bezug', 'zaehlpunkt': 'zaehlpunkt_bezug', 'zählpunktnummer': 'zaehlpunkt_bezug',
    'zaehlpunktnummer': 'zaehlpunkt_bezug', 'meter': 'zaehlpunkt_bezug',
    'pv': 'pv_leistung_kwp', 'pv-leistung': 'pv_leistung_kwp', 'kwp': 'pv_leistung_kwp',
    'jahresverbrauch': 'jahresverbrauch_kwh', 'verbrauch': 'jahresverbrauch_kwh',
    'status': 'status',
    'beitritt': 'genehmigt_am', 'beitrittsdatum': 'genehmigt_am', 'genehmigt_am': 'genehmigt_am',
    'mitgliedsform': 'mitgliedstyp', 'art': 'mitgliedstyp', 'typ': 'mitgliedstyp', 'type': 'mitgliedstyp', 'mitgliedstyp': 'mitgliedstyp',
};

// CSV Parser (einfach, ohne externe Bibliothek)
function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Trennzeichen erkennen (Semikolon oder Komma)
    const sep = lines[0].includes(';') ? ';' : ',';

    function parseLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') {
                if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
                else { inQuotes = !inQuotes; }
            } else if (c === sep && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += c;
            }
        }
        result.push(current.trim());
        return result;
    }

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(l => {
        const vals = parseLine(l);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
    }).filter(r => Object.values(r).some(v => v));

    return { headers, rows };
}

// Excel Parser
async function parseExcel(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };

    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
        headers.push(String(cell.value || '').trim());
    });

    const rows = [];
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const obj = {};
        let hasData = false;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const h = headers[colNumber - 1];
            if (h) {
                let val = cell.value;
                if (val && typeof val === 'object' && val.result !== undefined) val = val.result;
                if (val instanceof Date) val = val.toISOString().split('T')[0];
                obj[h] = val !== null && val !== undefined ? String(val).trim() : '';
                if (obj[h]) hasData = true;
            }
        });
        if (hasData) rows.push(obj);
    });

    return { headers: headers.filter(Boolean), rows };
}

// POST /api/admin/import/preview - Datei hochladen und Vorschau liefern
router.post('/preview', requirePermission('mitglieder'), upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });

    try {
        let parsed;
        const isExcel = req.file.originalname.match(/\.xlsx?$/i) ||
            req.file.mimetype.includes('spreadsheet') || req.file.mimetype.includes('excel');

        if (isExcel) {
            parsed = await parseExcel(req.file.buffer);
        } else {
            const text = req.file.buffer.toString('utf-8');
            parsed = parseCSV(text);
        }

        if (parsed.headers.length === 0) {
            return res.status(400).json({ error: 'Datei ist leer oder konnte nicht gelesen werden' });
        }

        // Auto-Mapping
        const mapping = {};
        parsed.headers.forEach(h => {
            const key = h.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
            const normalized = h.toLowerCase().trim();
            mapping[h] = AUTO_MAP[normalized] || AUTO_MAP[key] || 'skip';
        });

        res.json({
            headers: parsed.headers,
            preview: parsed.rows.slice(0, 5),
            total: parsed.rows.length,
            mapping,
            field_defs: FIELD_DEFS,
            // Alle Daten base64 kodiert für den Execute-Schritt
            data: Buffer.from(JSON.stringify(parsed.rows)).toString('base64')
        });
    } catch (err) {
        console.error('[IMPORT] Preview:', err.message);
        res.status(500).json({ error: 'Datei konnte nicht verarbeitet werden. Bitte Format pruefen.' });
    }
});

// POST /api/admin/import/execute - Daten importieren
router.post('/execute', requirePermission('mitglieder'), async (req, res) => {
    const { data, mapping, eeg_id, duplicate_mode = 'skip' } = req.body;
    // duplicate_mode: 'skip' | 'update'

    if (!data || !mapping) return res.status(400).json({ error: 'Fehlende Parameter' });

    const targetEegId = parseInt(eeg_id) || req.eegId;
    if (!targetEegId) return res.status(400).json({ error: 'Keine EEG ausgewählt' });

    let rows;
    try {
        rows = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
    } catch {
        return res.status(400).json({ error: 'Ungültige Daten' });
    }

    // Mitgliedstypen laden
    const [memberTypes] = await pool.query('SELECT id, key_name, label_de FROM eeg_member_types WHERE eeg_id = ? OR eeg_id IS NULL', [targetEegId]);
    const typeMap = {};
    memberTypes.forEach(t => {
        typeMap[t.key_name.toLowerCase()] = t.id;
        typeMap[t.label_de.toLowerCase()] = t.id;
    });
    // Fallback-Mapping für gängige Bezeichnungen
    const typeAliases = {
        'privatperson': 'privatperson', 'privat': 'privatperson', 'person': 'privatperson',
        'unternehmen': 'unternehmen', 'firma': 'unternehmen', 'firmen': 'unternehmen', 'betrieb': 'unternehmen',
        'landwirtschaft': 'landwirtschaft', 'bauer': 'landwirtschaft', 'landwirt': 'landwirtschaft',
    };

    const results = { imported: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
            // Felder mappen
            const mapped = {};
            for (const [col, field] of Object.entries(mapping)) {
                if (field && field !== 'skip' && row[col] !== undefined) {
                    mapped[field] = row[col];
                }
            }

            // Mitgliedstyp bestimmen
            let memberTypeId = null;
            const typRaw = (mapped.mitgliedstyp || '').toLowerCase().trim();
            const alias = typeAliases[typRaw] || typRaw;
            memberTypeId = typeMap[alias] || typeMap['privatperson'] || memberTypes[0]?.id;

            if (!memberTypeId) {
                results.errors.push(`Zeile ${i+2}: Unbekannter Mitgliedstyp "${mapped.mitgliedstyp}"`);
                results.skipped++;
                continue;
            }

            // Mindestanforderungen
            const name = mapped.firmenname || mapped.vorname || mapped.nachname;
            if (!name) {
                results.errors.push(`Zeile ${i+2}: Kein Name gefunden`);
                results.skipped++;
                continue;
            }

            // Duplikat-Check via E-Mail oder IBAN
            if (mapped.email || mapped.iban) {
                const [existing] = await pool.query(
                    'SELECT id FROM eeg_applications WHERE eeg_id = ? AND (email = ? OR iban = ?) AND geloescht_am IS NULL LIMIT 1',
                    [targetEegId, mapped.email || null, mapped.iban ? mapped.iban.replace(/\s/g,'') : null]
                );
                if (existing.length > 0 && duplicate_mode === 'skip') {
                    results.skipped++;
                    continue;
                }
            }

            // Status bestimmen
            const statusRaw = (mapped.status || 'aktiv').toLowerCase();
            const statusMap = { 'aktiv': 'aktiv', 'genehmigt': 'aktiv', 'active': 'aktiv', 'mitglied': 'aktiv' };
            const status = statusMap[statusRaw] || 'aktiv';

            // Datum parsen
            function parseDate(s) {
                if (!s) return null;
                // DD.MM.YYYY
                const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
                // YYYY-MM-DD bereits ok
                if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
                return null;
            }

            const genehmigt = parseDate(mapped.genehmigt_am) || new Date().toISOString().split('T')[0];
            const geburtsdatum = parseDate(mapped.geburtsdatum);

            // Eintrag in eeg_applications
            const [appResult] = await pool.query(`
                INSERT INTO eeg_applications
                    (eeg_id, member_type_id, status, titel, vorname, nachname, postname,
                     firmenname, uid_nummer, firmenbuchnummer,
                     strasse, hausnummer, plz, ort, telefon, email, geburtsdatum,
                     iban, kontoinhaber, bankname, sepa_akzeptiert,
                     statuten_akzeptiert, agb_akzeptiert, datenschutz_akzeptiert, netzbetreiber_vollmacht,
                     genehmigt_am, eingereicht_am)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                targetEegId, memberTypeId, status,
                mapped.titel || null,
                mapped.vorname || null,
                mapped.nachname || null,
                mapped.postname || null,
                mapped.firmenname || null,
                mapped.uid_nummer || null,
                mapped.firmenbuchnummer || null,
                mapped.strasse || null,
                mapped.hausnummer || null,
                mapped.plz || null,
                mapped.ort || null,
                mapped.telefon || null,
                mapped.email || null,
                geburtsdatum,
                mapped.iban ? mapped.iban.replace(/\s/g,'') : null,
                mapped.kontoinhaber || mapped.vorname && mapped.nachname ? `${mapped.vorname||''} ${mapped.nachname||''}`.trim() : null,
                mapped.bankname || null,
                genehmigt,
                genehmigt,
                genehmigt,
                genehmigt,
                genehmigt,
                genehmigt,
                genehmigt
            ]);

            const appId = appResult.insertId;

            // Zählpunkte
            if (mapped.zaehlpunkt_bezug) {
                const zpNr = mapped.zaehlpunkt_bezug.replace(/\s/g,'');
                if (zpNr.length >= 10) {
                    await pool.query(`
                        INSERT INTO eeg_zaehlpunkte (application_id, typ, zaehlpunktnummer, jahresverbrauch_kwh)
                        VALUES (?, 'bezug', ?, ?)
                    `, [appId, zpNr, mapped.jahresverbrauch_kwh ? parseInt(mapped.jahresverbrauch_kwh) : null]);
                }
            }

            if (mapped.zaehlpunkt_einspeisung) {
                const zpNr = mapped.zaehlpunkt_einspeisung.replace(/\s/g,'');
                if (zpNr.length >= 10) {
                    await pool.query(`
                        INSERT INTO eeg_zaehlpunkte (application_id, typ, zaehlpunktnummer, pv_leistung_kwp)
                        VALUES (?, 'einspeisung', ?, ?)
                    `, [appId, zpNr, mapped.pv_leistung_kwp ? parseFloat(mapped.pv_leistung_kwp) : null]);
                }
            }

            results.imported++;
        } catch (err) {
            console.error(`[IMPORT] Zeile ${i+2}:`, err.message);
            results.errors.push(`Zeile ${i+2}: ${err.message}`);
            results.skipped++;
        }
    }

    res.json({
        success: true,
        ...results,
        total: rows.length
    });
});

// GET /api/admin/import/template/xlsx - Excel-Vorlage herunterladen
router.get('/template/xlsx', async (req, res) => {
    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Mitglieder-Import');

        const headers = [
            'Mitgliedstyp', 'Titel', 'Vorname', 'Nachname', 'Postnomen',
            'Firmenname', 'UID-Nummer', 'Firmenbuchnummer',
            'Geburtsdatum', 'Straße', 'Hausnummer', 'PLZ', 'Ort',
            'Telefon', 'E-Mail', 'IBAN', 'Kontoinhaber', 'Bankname',
            'Zählpunkt Bezug', 'Zählpunkt Einspeisung', 'PV-Leistung (kWp)',
            'Jahresverbrauch (kWh)', 'Beitrittsdatum'
        ];

        // Header-Zeile formatieren
        ws.addRow(headers);
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
        headers.forEach((_, i) => { ws.getColumn(i+1).width = 22; });

        // Beispielzeile
        ws.addRow([
            'Privatperson', 'Mag.', 'Maria', 'Muster', '',
            '', '', '',
            '01.01.1980', 'Musterstraße', '1', '4655', 'Vorchdorf',
            '+43 664 123456', 'maria@example.at',
            'AT12 3456 7890 1234 5678', 'Maria Muster', 'Raiffeisenbank',
            'AT003000000000000000001234567', '', '',
            '4500', '01.01.2024'
        ]);
        ws.getRow(2).font = { italic: true, color: { argb: 'FF94A3B8' } };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="EEG-Import-Vorlage.xlsx"');
        await wb.xlsx.write(res);
    } catch (err) {
        res.status(500).json({ error: 'Fehler' });
    }
});

// GET /api/admin/import/template/csv - CSV-Vorlage herunterladen
router.get('/template/csv', (req, res) => {
    const headers = [
        'Mitgliedstyp', 'Titel', 'Vorname', 'Nachname', 'Postnomen',
        'Firmenname', 'UID-Nummer', 'Firmenbuchnummer',
        'Geburtsdatum', 'Straße', 'Hausnummer', 'PLZ', 'Ort',
        'Telefon', 'E-Mail', 'IBAN', 'Kontoinhaber', 'Bankname',
        'Zählpunkt Bezug', 'Zählpunkt Einspeisung', 'PV-Leistung (kWp)',
        'Jahresverbrauch (kWh)', 'Beitrittsdatum'
    ];
    const example = [
        'Privatperson', 'Mag.', 'Maria', 'Muster', '',
        '', '', '',
        '01.01.1980', 'Musterstraße', '1', '4655', 'Vorchdorf',
        '+43 664 123456', 'maria@example.at',
        'AT12 3456 7890 1234 5678', 'Maria Muster', 'Raiffeisenbank',
        'AT003000000000000000001234567', '', '',
        '4500', '01.01.2024'
    ];
    const csv = [headers, example].map(row =>
        row.map(v => `"${v}"`).join(';')
    ).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="EEG-Import-Vorlage.csv"');
    res.send('\uFEFF' + csv); // BOM für Excel
});

module.exports = router;
