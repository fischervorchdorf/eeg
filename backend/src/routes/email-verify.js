/**
 * E-Mail-Verifikation mit 6-stelligem Code
 * (analog zu regions.app)
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { sendMail, renderVerificationEmail } = require('../utils/mailer');
const { validateEmail } = require('../utils/validators');

// Passphrase-Auth (gleich wie in onboarding.js)
async function requirePassphrase(req, res, next) {
    const passphrase = req.headers['x-passphrase'] || req.query.passphrase;
    const appId = parseInt(req.params.id);

    if (!passphrase || !appId) {
        return res.status(401).json({ error: 'Passphrase erforderlich' });
    }

    const [apps] = await pool.query(
        'SELECT id, passphrase_hash, eeg_id, email, email_verified FROM eeg_applications WHERE id = ?',
        [appId]
    );
    if (apps.length === 0) return res.status(404).json({ error: 'Antrag nicht gefunden' });

    const match = await bcrypt.compare(passphrase, apps[0].passphrase_hash);
    if (!match) return res.status(401).json({ error: 'Ungueltige Passphrase' });

    req.application = apps[0];
    next();
}

// POST /api/email-verify/:id/send - 6-stelligen Code generieren und senden
router.post('/:id/send', requirePassphrase, async (req, res) => {
    try {
        const { email } = req.body;
        const appId = req.application.id;

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return res.status(400).json({ error: emailValidation.error });
        }

        // Rate-Limiting: max 3 Codes pro 15 Minuten pro Antrag
        const [recent] = await pool.query(
            'SELECT COUNT(*) as cnt FROM eeg_email_verifications WHERE application_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)',
            [appId]
        );
        if (recent[0].cnt >= 3) {
            return res.status(429).json({ error: 'Zu viele Versuche. Bitte 15 Minuten warten.' });
        }

        // 6-stelligen Code generieren
        const code = crypto.randomInt(100000, 999999).toString();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

        // Alte unverifizierte Codes loeschen
        await pool.query(
            'DELETE FROM eeg_email_verifications WHERE application_id = ? AND verified = 0',
            [appId]
        );

        await pool.query(
            'INSERT INTO eeg_email_verifications (application_id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)',
            [appId, email, codeHash, expiresAt]
        );

        // EEG-Name laden
        const [tenants] = await pool.query(
            'SELECT name FROM eeg_tenants WHERE id = ?',
            [req.application.eeg_id]
        );
        const eegName = tenants[0]?.name || 'Energiegemeinschaft';

        // Mail senden
        const { text, html } = renderVerificationEmail({ code, eegName, applicationId: appId });
        const result = await sendMail({
            to: email,
            subject: `${eegName} - Dein Bestaetigungscode`,
            text,
            html
        });

        if (!result.success) {
            return res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' });
        }

        res.json({
            success: true,
            message: 'Bestaetigungscode wurde gesendet',
            dev_code: result.dev ? code : undefined  // Nur im Dev-Modus den Code zurueckgeben
        });
    } catch (err) {
        console.error('[EMAIL-VERIFY] Send:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/email-verify/:id/check - Code pruefen
router.post('/:id/check', requirePassphrase, async (req, res) => {
    try {
        const { code } = req.body;
        const appId = req.application.id;

        if (!code || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ error: 'Ungueltiger Code (6 Ziffern erforderlich)' });
        }

        const [verifs] = await pool.query(
            `SELECT id, email, code_hash, attempts, expires_at FROM eeg_email_verifications
             WHERE application_id = ? AND verified = 0
             ORDER BY id DESC LIMIT 1`,
            [appId]
        );

        if (verifs.length === 0) {
            return res.status(400).json({ error: 'Kein aktiver Code. Bitte neu anfordern.' });
        }

        const verif = verifs[0];

        if (new Date(verif.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Code abgelaufen. Bitte neu anfordern.' });
        }

        if (verif.attempts >= 5) {
            return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte neu anfordern.' });
        }

        const match = await bcrypt.compare(code, verif.code_hash);

        if (!match) {
            await pool.query(
                'UPDATE eeg_email_verifications SET attempts = attempts + 1 WHERE id = ?',
                [verif.id]
            );
            return res.status(400).json({ error: 'Code falsch', remaining: 4 - verif.attempts });
        }

        // Erfolg: Code als verifiziert markieren + email_verified Flag setzen
        await pool.query(
            'UPDATE eeg_email_verifications SET verified = 1 WHERE id = ?',
            [verif.id]
        );
        await pool.query(
            'UPDATE eeg_applications SET email_verified = 1, email = ? WHERE id = ?',
            [verif.email, appId]
        );

        res.json({ success: true, message: 'E-Mail erfolgreich bestaetigt' });
    } catch (err) {
        console.error('[EMAIL-VERIFY] Check:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/email-verify/send - Code senden OHNE Application-ID (für Schritt 3 vor Antragserstellung)
// Rate-Limiting via IP
router.post('/send', async (req, res) => {
    try {
        const { email, eeg_id } = req.body;
        if (!email) return res.status(400).json({ error: 'E-Mail fehlt' });

        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) return res.status(400).json({ error: emailValidation.error });

        const code = crypto.randomInt(100000, 999999).toString();

        // EEG-Name laden
        let eegName = 'Energiegemeinschaft';
        if (eeg_id) {
            const [tenants] = await pool.query('SELECT name FROM eeg_tenants WHERE id = ?', [eeg_id]);
            if (tenants[0]) eegName = tenants[0].name;
        }

        // Code in Session speichern (einfach in DB ohne application_id = 0)
        const codeHash = await bcrypt.hash(code, 8);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(
            `INSERT INTO eeg_email_verifications (application_id, email, code_hash, expires_at)
             VALUES (0, ?, ?, ?)
             ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), verified = 0, attempts = 0`,
            [email, codeHash, expiresAt]
        );

        const { text, html } = renderVerificationEmail({ code, eegName, applicationId: 0 });
        const result = await sendMail({
            to: email,
            subject: `${eegName} – Dein Bestätigungscode`,
            text, html
        });

        if (!result.success) {
            return res.status(502).json({ error: 'E-Mail konnte nicht gesendet werden' });
        }

        res.json({
            success: true,
            message: 'Bestätigungscode wurde gesendet',
            dev_code: result.dev ? code : undefined
        });
    } catch (err) {
        console.error('[EMAIL-VERIFY] Send (no-app):', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/email-verify/check - Code prüfen OHNE Application-ID
router.post('/check', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'E-Mail und Code erforderlich' });
        if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Ungültiger Code' });

        const [verifs] = await pool.query(
            `SELECT id, code_hash, attempts, expires_at FROM eeg_email_verifications
             WHERE application_id = 0 AND email = ? AND verified = 0
             ORDER BY id DESC LIMIT 1`,
            [email]
        );

        if (!verifs.length) return res.status(400).json({ error: 'Kein aktiver Code – bitte neu anfordern' });

        const verif = verifs[0];
        if (new Date(verif.expires_at) < new Date()) return res.status(400).json({ error: 'Code abgelaufen – bitte neu anfordern' });
        if (verif.attempts >= 5) return res.status(429).json({ error: 'Zu viele Fehlversuche – bitte neu anfordern' });

        const match = await bcrypt.compare(code, verif.code_hash);
        if (!match) {
            await pool.query('UPDATE eeg_email_verifications SET attempts = attempts + 1 WHERE id = ?', [verif.id]);
            return res.status(400).json({ error: 'Code falsch', remaining: 4 - verif.attempts });
        }

        await pool.query('UPDATE eeg_email_verifications SET verified = 1 WHERE id = ?', [verif.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('[EMAIL-VERIFY] Check (no-app):', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
