const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

// POST /api/applicant/login - Status-Check via Email + Passphrase
router.post('/login', async (req, res) => {
    try {
        const { email, passphrase } = req.body;
        if (!email || !passphrase) {
            return res.status(400).json({ error: 'E-Mail und Passphrase erforderlich' });
        }

        const [apps] = await pool.query(
            `SELECT a.id, a.passphrase_hash, a.status, a.vorname, a.nachname, a.email,
                    a.eingereicht_am, a.genehmigt_am, a.created_at, a.current_step,
                    mt.label_de as member_type, e.name as eeg_name
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             JOIN eeg_tenants e ON a.eeg_id = e.id
             WHERE a.email = ? AND a.geloescht_am IS NULL
             ORDER BY a.created_at DESC`,
            [email.trim().toLowerCase()]
        );

        if (apps.length === 0) {
            return res.status(404).json({ error: 'Kein Antrag mit dieser E-Mail gefunden' });
        }

        // Passphrase gegen alle Antrage dieser Email pruefen
        let matchedApp = null;
        for (const app of apps) {
            const match = await bcrypt.compare(passphrase, app.passphrase_hash);
            if (match) {
                matchedApp = app;
                break;
            }
        }

        if (!matchedApp) {
            return res.status(401).json({ error: 'Ungueltige Passphrase' });
        }

        const statusLabels = {
            entwurf: 'Entwurf (noch nicht eingereicht)',
            eingereicht: 'Eingereicht - wird geprueft',
            in_pruefung: 'In Pruefung',
            genehmigt: 'Genehmigt',
            abgelehnt: 'Abgelehnt',
            aktiv: 'Aktives Mitglied',
            gekuendigt: 'Gekuendigt'
        };

        res.json({
            id: matchedApp.id,
            vorname: matchedApp.vorname,
            nachname: matchedApp.nachname,
            email: matchedApp.email,
            status: matchedApp.status,
            status_text: statusLabels[matchedApp.status] || matchedApp.status,
            member_type: matchedApp.member_type,
            eeg_name: matchedApp.eeg_name,
            eingereicht_am: matchedApp.eingereicht_am,
            genehmigt_am: matchedApp.genehmigt_am,
            current_step: matchedApp.current_step
        });
    } catch (err) {
        console.error('[APPLICANT] Login:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/applicant/dsgvo/auskunft - Datenauskunft (Art 15 DSGVO)
router.post('/dsgvo/auskunft', async (req, res) => {
    try {
        const { email, passphrase } = req.body;
        if (!email || !passphrase) {
            return res.status(400).json({ error: 'E-Mail und Passphrase erforderlich' });
        }

        const [apps] = await pool.query(
            'SELECT * FROM eeg_applications WHERE email = ? AND geloescht_am IS NULL',
            [email.trim().toLowerCase()]
        );

        let matchedApp = null;
        for (const app of apps) {
            const match = await bcrypt.compare(passphrase, app.passphrase_hash);
            if (match) { matchedApp = app; break; }
        }

        if (!matchedApp) return res.status(401).json({ error: 'Ungueltige Anmeldedaten' });

        delete matchedApp.passphrase_hash;

        // Zahlpunkte
        const [zps] = await pool.query('SELECT * FROM eeg_zaehlpunkte WHERE application_id = ?', [matchedApp.id]);

        // Consent-Log
        const [consents] = await pool.query('SELECT * FROM eeg_consent_log WHERE application_id = ?', [matchedApp.id]);

        res.json({
            hinweis: 'Dies ist Ihre Datenauskunft gemaess Art. 15 DSGVO',
            personenbezogene_daten: matchedApp,
            zaehlpunkte: zps,
            einwilligungen: consents,
            rechte: {
                berichtigung: 'Art. 16 DSGVO - Kontaktieren Sie Ihre EEG',
                loeschung: 'Art. 17 DSGVO - POST /api/applicant/dsgvo/loeschung',
                datenportabilitaet: 'Art. 20 DSGVO - Diese Daten sind maschinenlesbar (JSON)'
            }
        });
    } catch (err) {
        console.error('[APPLICANT] DSGVO Auskunft:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/applicant/dsgvo/loeschung - Loeschantrag (Art 17 DSGVO)
router.post('/dsgvo/loeschung', async (req, res) => {
    try {
        const { email, passphrase } = req.body;
        if (!email || !passphrase) {
            return res.status(400).json({ error: 'E-Mail und Passphrase erforderlich' });
        }

        const [apps] = await pool.query(
            'SELECT id, passphrase_hash, eeg_id FROM eeg_applications WHERE email = ? AND geloescht_am IS NULL',
            [email.trim().toLowerCase()]
        );

        let matchedApp = null;
        for (const app of apps) {
            const match = await bcrypt.compare(passphrase, app.passphrase_hash);
            if (match) { matchedApp = app; break; }
        }

        if (!matchedApp) return res.status(401).json({ error: 'Ungueltige Anmeldedaten' });

        await pool.query(
            'UPDATE eeg_applications SET loeschung_angefragt_am = NOW() WHERE id = ?',
            [matchedApp.id]
        );

        await pool.query(
            `INSERT INTO eeg_audit_log (eeg_id, aktion, entity_type, entity_id, ip_adresse)
             VALUES (?, 'dsgvo_loeschung_angefragt', 'application', ?, ?)`,
            [matchedApp.eeg_id, matchedApp.id, req.ip]
        );

        res.json({
            success: true,
            message: 'Ihr Loeschantrag wurde registriert. Die EEG wird sich mit Ihnen in Verbindung setzen.'
        });
    } catch (err) {
        console.error('[APPLICANT] DSGVO Loeschung:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
