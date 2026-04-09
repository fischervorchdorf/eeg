const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const pool = require('../config/db');
const { tenantResolver, getTenantBySlug } = require('../middleware/tenantResolver');
const { generatePassphrase } = require('../utils/passphrase');
const { validateStep, validateZaehlpunkt, validateEmail } = require('../utils/validators');
const { uploadFile } = require('../utils/s3-client');
const { generatePreviewPdf } = require('../utils/pdf-preview');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// Passphrase-Auth Middleware fuer Antragsteller
async function requirePassphrase(req, res, next) {
    const passphrase = req.headers['x-passphrase'] || req.query.passphrase;
    const appId = parseInt(req.params.id);

    if (!passphrase || !appId) {
        return res.status(401).json({ error: 'Passphrase erforderlich' });
    }

    const [apps] = await pool.query('SELECT id, passphrase_hash, eeg_id FROM eeg_applications WHERE id = ?', [appId]);
    if (apps.length === 0) return res.status(404).json({ error: 'Antrag nicht gefunden' });

    const match = await bcrypt.compare(passphrase, apps[0].passphrase_hash);
    if (!match) return res.status(401).json({ error: 'Ungueltige Passphrase' });

    req.application = apps[0];
    next();
}

// GET /api/onboarding/eeg/:slug - EEG-Branding + Config laden
router.get('/eeg/:slug', async (req, res) => {
    try {
        const tenant = await getTenantBySlug(req.params.slug);
        if (!tenant) return res.status(404).json({ error: 'EEG nicht gefunden' });

        // Oeffentliche Daten (kein internes)
        res.json({
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            sitz: tenant.sitz,
            farbe_primary: tenant.farbe_primary,
            farbe_secondary: tenant.farbe_secondary,
            logo_url: tenant.logo_url,
            background_url: tenant.background_url,
            eintrittsbeitrag_ct: tenant.eintrittsbeitrag_ct,
            zusatz_zaehlpunkt_ct: tenant.zusatz_zaehlpunkt_ct,
            preis_erzeugung_ct: tenant.preis_erzeugung_ct,
            preis_verbrauch_ct: tenant.preis_verbrauch_ct,
            mwst_satz: tenant.mwst_satz,
            statuten_url: tenant.statuten_url,
            agb_url: tenant.agb_url,
            datenschutz_url: tenant.datenschutz_url,
            creditor_id: tenant.creditor_id,
            kontakt_email: tenant.kontakt_email
        });
    } catch (err) {
        console.error('[ONBOARDING] EEG laden:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/onboarding/member-types - Mitgliedstypen laden
router.get('/member-types', async (req, res) => {
    try {
        const [types] = await pool.query('SELECT * FROM eeg_member_types ORDER BY id');
        res.json(types);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/onboarding/netzbetreiber - Netzbetreiber laden
router.get('/netzbetreiber', async (req, res) => {
    try {
        const [nb] = await pool.query('SELECT id, name, region, portal_url FROM eeg_netzbetreiber ORDER BY name');
        res.json(nb);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/onboarding/start - Neuen Antrag starten
router.post('/start', async (req, res) => {
    try {
        const { eeg_id, member_type_id } = req.body;

        if (!eeg_id || !member_type_id) {
            return res.status(400).json({ error: 'eeg_id und member_type_id erforderlich' });
        }

        // EEG pruefen
        const [eegs] = await pool.query('SELECT id FROM eeg_tenants WHERE id = ? AND aktiv = 1', [eeg_id]);
        if (eegs.length === 0) return res.status(404).json({ error: 'EEG nicht gefunden' });

        // Member-Type pruefen
        const [types] = await pool.query('SELECT id FROM eeg_member_types WHERE id = ?', [member_type_id]);
        if (types.length === 0) return res.status(400).json({ error: 'Ungueltiger Mitgliedstyp' });

        // Passphrase generieren
        const passphrase = generatePassphrase(5);
        const hash = await bcrypt.hash(passphrase, 10);

        const [result] = await pool.query(
            'INSERT INTO eeg_applications (eeg_id, member_type_id, passphrase_hash, current_step) VALUES (?, ?, ?, 1)',
            [eeg_id, member_type_id, hash]
        );

        res.json({
            success: true,
            application_id: result.insertId,
            passphrase: passphrase
        });
    } catch (err) {
        console.error('[ONBOARDING] Start:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/onboarding/:id/step/personal - Schritt 3: Persoenliche Daten
router.put('/:id/step/personal', requirePassphrase, async (req, res) => {
    try {
        const { titel, vorname, nachname, postname, strasse, hausnummer, plz, ort,
                ausweis_typ, ausweisnummer, geburtsdatum, telefon, email,
                firmenname, uid_nummer, firmenbuchnummer } = req.body;

        // Member-Type laden fuer Validierung
        const [apps] = await pool.query(
            'SELECT a.member_type_id, mt.key_name FROM eeg_applications a JOIN eeg_member_types mt ON a.member_type_id = mt.id WHERE a.id = ?',
            [req.params.id]
        );
        const memberType = apps[0]?.key_name;

        const validation = validateStep('personal', req.body, memberType);
        if (!validation.valid) {
            return res.status(400).json({ errors: validation.errors });
        }

        await pool.query(
            `UPDATE eeg_applications SET
                titel=?, vorname=?, nachname=?, postname=?, strasse=?, hausnummer=?, plz=?, ort=?,
                ausweis_typ=?, ausweisnummer=?, geburtsdatum=?, telefon=?, email=?,
                firmenname=?, uid_nummer=?, firmenbuchnummer=?,
                current_step = GREATEST(current_step, 2)
            WHERE id = ?`,
            [titel, vorname, nachname, postname, strasse, hausnummer, plz, ort,
             ausweis_typ, ausweisnummer, geburtsdatum || null, telefon, email,
             firmenname, uid_nummer, firmenbuchnummer, req.params.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('[ONBOARDING] Personal:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/onboarding/:id/step/zaehlpunkte - Schritt 4: Zahlpunkte
router.put('/:id/step/zaehlpunkte', requirePassphrase, async (req, res) => {
    try {
        const { bezug = [], einspeisung = [], energiespeicher = [] } = req.body;

        if (bezug.length === 0) {
            return res.status(400).json({ error: 'Mindestens ein Bezugs-Zaehlpunkt erforderlich' });
        }

        // Alle Zahlpunkte validieren
        for (const zp of [...bezug, ...einspeisung]) {
            const result = validateZaehlpunkt(zp.zaehlpunktnummer);
            if (!result.valid) {
                return res.status(400).json({ error: `Zaehlpunkt ${zp.zaehlpunktnummer}: ${result.error}` });
            }
        }

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();

            // Alte Zahlpunkte loeschen
            await conn.query('DELETE FROM eeg_zaehlpunkte WHERE application_id = ?', [req.params.id]);
            await conn.query('DELETE FROM eeg_energiespeicher WHERE application_id = ?', [req.params.id]);

            // Bezugs-Zahlpunkte einfuegen
            for (const zp of bezug) {
                await conn.query(
                    `INSERT INTO eeg_zaehlpunkte (application_id, typ, zaehlpunktnummer, inventarnummer)
                     VALUES (?, 'bezug', ?, ?)`,
                    [req.params.id, zp.zaehlpunktnummer.replace(/\s/g, ''), zp.inventarnummer || null]
                );
            }

            // Einspeise-Zahlpunkte einfuegen
            for (const zp of einspeisung) {
                await conn.query(
                    `INSERT INTO eeg_zaehlpunkte (application_id, typ, zaehlpunktnummer, pv_leistung_kwp, rueckspeise_limitierung, inventarnummer)
                     VALUES (?, 'einspeisung', ?, ?, ?, ?)`,
                    [req.params.id, zp.zaehlpunktnummer.replace(/\s/g, ''),
                     zp.pv_leistung_kwp || null, zp.rueckspeise_limitierung || null, zp.inventarnummer || null]
                );
            }

            // Energiespeicher einfuegen
            for (const es of energiespeicher) {
                await conn.query(
                    'INSERT INTO eeg_energiespeicher (application_id, typ, kapazitaet_kwh) VALUES (?, ?, ?)',
                    [req.params.id, es.typ || null, es.kapazitaet_kwh || null]
                );
            }

            await conn.query(
                'UPDATE eeg_applications SET current_step = GREATEST(current_step, 3) WHERE id = ?',
                [req.params.id]
            );

            await conn.commit();
            res.json({ success: true });
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } catch (err) {
        console.error('[ONBOARDING] Zaehlpunkte:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/onboarding/:id/step/ergaenzend - Schritt 5: Ergaenzende Angaben pro Zahlpunkt
router.put('/:id/step/ergaenzend', requirePassphrase, async (req, res) => {
    try {
        const { zaehlpunkte } = req.body;

        if (!Array.isArray(zaehlpunkte)) {
            return res.status(400).json({ error: 'Zaehlpunkte-Array erforderlich' });
        }

        for (const zp of zaehlpunkte) {
            await pool.query(
                `UPDATE eeg_zaehlpunkte SET
                    strasse=?, hausnummer=?, plz=?, ort=?,
                    teilnahmefaktor=?, jahresverbrauch_kwh=?
                WHERE id = ? AND application_id = ?`,
                [zp.strasse, zp.hausnummer, zp.plz, zp.ort,
                 zp.teilnahmefaktor || 100, zp.jahresverbrauch_kwh || null,
                 zp.id, req.params.id]
            );
        }

        await pool.query(
            'UPDATE eeg_applications SET current_step = GREATEST(current_step, 4) WHERE id = ?',
            [req.params.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('[ONBOARDING] Ergaenzend:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/onboarding/:id/step/dokumente - Schritt 6: Dokument-Upload
router.post('/:id/step/dokumente', requirePassphrase, upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Mindestens eine Datei erforderlich' });
        }

        // EEG-Slug laden
        const [apps] = await pool.query(
            'SELECT a.eeg_id, e.slug FROM eeg_applications a JOIN eeg_tenants e ON a.eeg_id = e.id WHERE a.id = ?',
            [req.params.id]
        );
        const eegSlug = apps[0]?.slug || 'unknown';

        const kategorie = req.body.kategorie || 'sonstiges';
        const results = [];

        for (const file of req.files) {
            const timestamp = Date.now();
            const ext = file.originalname.split('.').pop().toLowerCase();
            const key = `eeg-documents/${eegSlug}/${req.params.id}/${kategorie}-${timestamp}.${ext}`;

            const isImage = file.mimetype.startsWith('image/');
            const uploaded = await uploadFile(file.buffer, key, file.mimetype, isImage);

            const [insertResult] = await pool.query(
                `INSERT INTO eeg_documents (application_id, kategorie, original_name, s3_key, s3_url, local_path, mime_type, file_size)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.params.id, kategorie, file.originalname,
                 uploaded.s3_key, uploaded.s3_url, uploaded.local_path,
                 file.mimetype, file.size]
            );

            results.push({
                id: insertResult.insertId,
                name: file.originalname,
                url: uploaded.s3_url || uploaded.local_path
            });
        }

        await pool.query(
            'UPDATE eeg_applications SET current_step = GREATEST(current_step, 5) WHERE id = ?',
            [req.params.id]
        );

        res.json({ success: true, files: results });
    } catch (err) {
        console.error('[ONBOARDING] Dokumente:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/onboarding/:id/step/zahlung - Schritt 7: Zahlungsinformationen
router.put('/:id/step/zahlung', requirePassphrase, async (req, res) => {
    try {
        const { kontoinhaber, iban, bankname, sepa_akzeptiert } = req.body;

        const validation = validateStep('zahlung', req.body);
        if (!validation.valid) {
            return res.status(400).json({ errors: validation.errors });
        }

        await pool.query(
            `UPDATE eeg_applications SET
                kontoinhaber=?, iban=?, bankname=?, sepa_akzeptiert=?,
                current_step = GREATEST(current_step, 6)
            WHERE id = ?`,
            [kontoinhaber, iban?.replace(/\s/g, ''), bankname, sepa_akzeptiert ? 1 : 0, req.params.id]
        );

        // Consent-Log fuer SEPA
        if (sepa_akzeptiert) {
            await pool.query(
                'INSERT INTO eeg_consent_log (application_id, consent_type, accepted, ip_adresse, user_agent) VALUES (?, ?, 1, ?, ?)',
                [req.params.id, 'sepa_lastschrift', req.ip, req.headers['user-agent'] || '']
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[ONBOARDING] Zahlung:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/onboarding/:id/step/bestaetigung - Schritt 8: Bestaetigungen
router.put('/:id/step/bestaetigung', requirePassphrase, async (req, res) => {
    try {
        const { statuten_akzeptiert, agb_akzeptiert, datenschutz_akzeptiert,
                netzbetreiber_vollmacht, kundennummer_netzbetreiber, inventarnummer_zaehler } = req.body;

        const validation = validateStep('bestaetigung', req.body);
        if (!validation.valid) {
            return res.status(400).json({ errors: validation.errors });
        }

        await pool.query(
            `UPDATE eeg_applications SET
                statuten_akzeptiert=?, agb_akzeptiert=?, datenschutz_akzeptiert=?,
                netzbetreiber_vollmacht=?, kundennummer_netzbetreiber=?, inventarnummer_zaehler=?,
                current_step = GREATEST(current_step, 7)
            WHERE id = ?`,
            [statuten_akzeptiert ? 1 : 0, agb_akzeptiert ? 1 : 0, datenschutz_akzeptiert ? 1 : 0,
             netzbetreiber_vollmacht ? 1 : 0, kundennummer_netzbetreiber, inventarnummer_zaehler,
             req.params.id]
        );

        // Consent-Log
        const consents = ['statuten', 'agb', 'datenschutz', 'netzbetreiber_vollmacht'];
        for (const type of consents) {
            if (req.body[type === 'statuten' ? 'statuten_akzeptiert' :
                         type === 'agb' ? 'agb_akzeptiert' :
                         type === 'datenschutz' ? 'datenschutz_akzeptiert' :
                         'netzbetreiber_vollmacht']) {
                await pool.query(
                    'INSERT INTO eeg_consent_log (application_id, consent_type, accepted, ip_adresse, user_agent) VALUES (?, ?, 1, ?, ?)',
                    [req.params.id, type, req.ip, req.headers['user-agent'] || '']
                );
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[ONBOARDING] Bestaetigung:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/onboarding/:id/step/freiwillig - Schritt 9: Freiwillige Angaben
router.put('/:id/step/freiwillig', requirePassphrase, async (req, res) => {
    try {
        const { eauto_anzahl, eauto_batteriekapazitaet, eauto_jahreskilometer, warmwasser_typ } = req.body;

        await pool.query(
            `UPDATE eeg_applications SET
                eauto_anzahl=?, eauto_batteriekapazitaet=?, eauto_jahreskilometer=?, warmwasser_typ=?,
                current_step = GREATEST(current_step, 8)
            WHERE id = ?`,
            [eauto_anzahl || null, eauto_batteriekapazitaet || null,
             eauto_jahreskilometer || null, warmwasser_typ || null, req.params.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('[ONBOARDING] Freiwillig:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/onboarding/:id/submit - Antrag einreichen
router.post('/:id/submit', requirePassphrase, async (req, res) => {
    try {
        // Pruefen ob alle Pflichtfelder ausgefuellt sind
        const [apps] = await pool.query(
            `SELECT a.*, mt.key_name as member_type
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             WHERE a.id = ?`,
            [req.params.id]
        );
        const app = apps[0];

        if (!app) return res.status(404).json({ error: 'Antrag nicht gefunden' });
        if (app.status !== 'entwurf') {
            return res.status(400).json({ error: 'Antrag wurde bereits eingereicht' });
        }

        // Mindest-Validierung
        if (!app.vorname || !app.nachname || !app.email || !app.iban) {
            return res.status(400).json({ error: 'Bitte alle Pflichtfelder ausfuellen' });
        }

        // Zahlpunkte pruefen
        const [zps] = await pool.query(
            "SELECT COUNT(*) as cnt FROM eeg_zaehlpunkte WHERE application_id = ? AND typ = 'bezug'",
            [req.params.id]
        );
        if (zps[0].cnt === 0) {
            return res.status(400).json({ error: 'Mindestens ein Bezugs-Zaehlpunkt erforderlich' });
        }

        // Status auf eingereicht setzen
        await pool.query(
            `UPDATE eeg_applications SET status = 'eingereicht', eingereicht_am = NOW(), current_step = 10
             WHERE id = ?`,
            [req.params.id]
        );

        // Audit-Log
        await pool.query(
            `INSERT INTO eeg_audit_log (eeg_id, aktion, entity_type, entity_id, details, ip_adresse)
             VALUES (?, 'antrag_eingereicht', 'application', ?, ?, ?)`,
            [app.eeg_id, req.params.id,
             JSON.stringify({ vorname: app.vorname, nachname: app.nachname, member_type: app.member_type }),
             req.ip]
        );

        // TODO: Email senden (application_received + admin_new_application)

        res.json({ success: true, message: 'Antrag erfolgreich eingereicht!' });
    } catch (err) {
        console.error('[ONBOARDING] Submit:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/onboarding/:id/resume - Antrag fortsetzen
router.get('/:id/resume', requirePassphrase, async (req, res) => {
    try {
        const [apps] = await pool.query(
            `SELECT a.*, mt.key_name as member_type, mt.label_de as member_type_label
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             WHERE a.id = ?`,
            [req.params.id]
        );

        if (apps.length === 0) return res.status(404).json({ error: 'Antrag nicht gefunden' });
        const app = apps[0];
        delete app.passphrase_hash;

        // Zahlpunkte laden
        const [zaehlpunkte] = await pool.query(
            'SELECT * FROM eeg_zaehlpunkte WHERE application_id = ?',
            [req.params.id]
        );

        // Dokumente laden
        const [documents] = await pool.query(
            'SELECT id, kategorie, original_name, s3_url, local_path, mime_type, file_size FROM eeg_documents WHERE application_id = ?',
            [req.params.id]
        );

        // Energiespeicher laden
        const [speicher] = await pool.query(
            'SELECT * FROM eeg_energiespeicher WHERE application_id = ?',
            [req.params.id]
        );

        res.json({
            application: app,
            zaehlpunkte,
            documents,
            energiespeicher: speicher
        });
    } catch (err) {
        console.error('[ONBOARDING] Resume:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/onboarding/default-eeg - Standard-Tenant zurueckgeben (wenn nur einer existiert)
router.get('/default-eeg', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, slug, name FROM eeg_tenants WHERE aktiv = 1 ORDER BY id LIMIT 2'
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Keine EEG konfiguriert' });
        }
        // Wenn mehrere existieren, soll der User explizit per ?eeg= waehlen
        if (rows.length > 1) {
            return res.json({ multiple: true });
        }
        // Vollstaendige Tenant-Daten ueber slug-Endpoint laden
        const { getTenantBySlug } = require('../middleware/tenantResolver');
        const tenant = await getTenantBySlug(rows[0].slug);
        res.json({
            id: tenant.id, name: tenant.name, slug: tenant.slug, sitz: tenant.sitz,
            farbe_primary: tenant.farbe_primary, farbe_secondary: tenant.farbe_secondary,
            logo_url: tenant.logo_url, background_url: tenant.background_url,
            eintrittsbeitrag_ct: tenant.eintrittsbeitrag_ct,
            zusatz_zaehlpunkt_ct: tenant.zusatz_zaehlpunkt_ct,
            preis_erzeugung_ct: tenant.preis_erzeugung_ct,
            preis_verbrauch_ct: tenant.preis_verbrauch_ct,
            mwst_satz: tenant.mwst_satz,
            statuten_url: tenant.statuten_url, agb_url: tenant.agb_url, datenschutz_url: tenant.datenschutz_url,
            creditor_id: tenant.creditor_id, kontakt_email: tenant.kontakt_email
        });
    } catch (err) {
        console.error('[ONBOARDING] default-eeg:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// HEAD /api/onboarding/:id/exists - Leichtgewichtiger Existenz-Check (Stale-Session)
router.get('/:id/exists', async (req, res) => {
    try {
        const passphrase = req.headers['x-passphrase'] || req.query.passphrase;
        if (!passphrase) return res.status(401).json({ exists: false });

        const [apps] = await pool.query(
            'SELECT id, passphrase_hash, status FROM eeg_applications WHERE id = ?',
            [parseInt(req.params.id)]
        );
        if (apps.length === 0) return res.status(404).json({ exists: false });

        const match = await bcrypt.compare(passphrase, apps[0].passphrase_hash);
        if (!match) return res.status(401).json({ exists: false });

        res.json({ exists: true, status: apps[0].status });
    } catch (err) {
        res.status(500).json({ exists: false });
    }
});

// GET /api/onboarding/:id/preview-pdf - PDF-Vorschau des Antrags
router.get('/:id/preview-pdf', requirePassphrase, async (req, res) => {
    try {
        const [apps] = await pool.query(
            `SELECT a.*, t.name as eeg_name FROM eeg_applications a
             JOIN eeg_tenants t ON a.eeg_id = t.id
             WHERE a.id = ?`,
            [req.params.id]
        );
        if (apps.length === 0) return res.status(404).json({ error: 'Antrag nicht gefunden' });

        const [zaehlpunkte] = await pool.query(
            'SELECT * FROM eeg_zaehlpunkte WHERE application_id = ?',
            [req.params.id]
        );

        const pdfBuffer = await generatePreviewPdf(apps[0], zaehlpunkte, apps[0].eeg_name);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="antrag-${req.params.id}-vorschau.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[ONBOARDING] PDF-Preview:', err.message);
        res.status(500).json({ error: 'PDF-Generierung fehlgeschlagen' });
    }
});

module.exports = router;
