const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const { requireLogin } = require('../middleware/requireLogin');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
        }

        const [users] = await pool.query(
            'SELECT id, username, email, password_hash, rolle, eeg_id, berechtigungen, aktiv FROM eeg_admin_users WHERE username = ? LIMIT 1',
            [username.trim()]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }

        const user = users[0];
        if (!user.aktiv) {
            return res.status(403).json({ error: 'Benutzer deaktiviert' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }

        // Session erstellen (8 Stunden) - Token gehasht in DB speichern
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

        await pool.query(
            'INSERT INTO eeg_admin_sessions (user_id, token, ip_adresse, user_agent, laeuft_ab) VALUES (?, ?, ?, ?, ?)',
            [user.id, tokenHash, req.ip, req.headers['user-agent'] || '', expiresAt]
        );

        // Letzter Login aktualisieren
        await pool.query('UPDATE eeg_admin_users SET letzter_login = NOW() WHERE id = ?', [user.id]);

        // Cookie setzen
        res.cookie('eeg_admin_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000
        });

        let berechtigungen = user.berechtigungen;
        if (typeof berechtigungen === 'string') {
            try { berechtigungen = JSON.parse(berechtigungen); } catch { berechtigungen = {}; }
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                rolle: user.rolle,
                eeg_id: user.eeg_id,
                berechtigungen: berechtigungen || {}
            }
        });
    } catch (err) {
        console.error('[AUTH] Login-Fehler:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    const token = req.cookies?.eeg_admin_session;
    if (token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await pool.query('DELETE FROM eeg_admin_sessions WHERE token = ?', [tokenHash]).catch(() => {});
    }
    res.clearCookie('eeg_admin_session');
    res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireLogin, (req, res) => {
    const u = req.adminUser;
    res.json({
        id: u.user_id,
        username: u.username,
        email: u.email,
        rolle: u.rolle,
        eeg_id: u.eeg_id,
        berechtigungen: u.berechtigungen
    });
});

module.exports = router;
