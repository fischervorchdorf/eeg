const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { requireLogin, requireSuperAdmin } = require('../middleware/requireLogin');

router.use(requireLogin);
router.use(requireSuperAdmin);

// --- EEG-Verwaltung ---

// GET /api/super-admin/eegs
router.get('/eegs', async (req, res) => {
    try {
        const [eegs] = await pool.query(
            `SELECT e.*,
                (SELECT COUNT(*) FROM eeg_applications a WHERE a.eeg_id = e.id AND a.status IN ('genehmigt','aktiv')) as mitglieder,
                (SELECT COUNT(*) FROM eeg_applications a WHERE a.eeg_id = e.id AND a.status = 'eingereicht') as offene_antraege
             FROM eeg_tenants e ORDER BY e.name`
        );
        res.json(eegs);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/super-admin/eegs
router.post('/eegs', async (req, res) => {
    try {
        const { name, slug, sitz, zvr_nummer, kontakt_email, creditor_id } = req.body;

        if (!name || !slug) return res.status(400).json({ error: 'Name und Slug erforderlich' });

        // Slug pruefen
        const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const [existing] = await pool.query('SELECT id FROM eeg_tenants WHERE slug = ?', [cleanSlug]);
        if (existing.length > 0) return res.status(400).json({ error: 'Slug bereits vergeben' });

        const [result] = await pool.query(
            'INSERT INTO eeg_tenants (name, slug, sitz, zvr_nummer, kontakt_email, creditor_id) VALUES (?, ?, ?, ?, ?, ?)',
            [name, cleanSlug, sitz, zvr_nummer, kontakt_email, creditor_id]
        );

        res.json({ success: true, id: result.insertId, slug: cleanSlug });
    } catch (err) {
        console.error('[SUPER-ADMIN] EEG erstellen:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/super-admin/eegs/:id
router.put('/eegs/:id', async (req, res) => {
    try {
        const fields = ['name', 'sitz', 'zvr_nummer', 'kontakt_email', 'creditor_id', 'domain'];
        const updates = [];
        const params = [];

        for (const f of fields) {
            if (req.body[f] !== undefined) {
                updates.push(`${f} = ?`);
                params.push(req.body[f]);
            }
        }

        if (updates.length === 0) return res.status(400).json({ error: 'Keine Aenderungen' });

        params.push(req.params.id);
        await pool.query(`UPDATE eeg_tenants SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PATCH /api/super-admin/eegs/:id/toggle
router.patch('/eegs/:id/toggle', async (req, res) => {
    try {
        await pool.query('UPDATE eeg_tenants SET aktiv = NOT aktiv WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// --- Admin-User-Verwaltung ---

// GET /api/super-admin/users
router.get('/users', async (req, res) => {
    try {
        const [users] = await pool.query(
            `SELECT u.id, u.username, u.email, u.rolle, u.eeg_id, u.berechtigungen,
                    u.aktiv, u.letzter_login, u.created_at,
                    e.name as eeg_name
             FROM eeg_admin_users u
             LEFT JOIN eeg_tenants e ON e.id = u.eeg_id
             ORDER BY u.rolle DESC, u.username`
        );
        users.forEach(u => {
            if (typeof u.berechtigungen === 'string') {
                try { u.berechtigungen = JSON.parse(u.berechtigungen); } catch { u.berechtigungen = {}; }
            }
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/super-admin/users
router.post('/users', async (req, res) => {
    try {
        const { username, password, email, rolle, eeg_id, berechtigungen } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({ error: 'Username, Passwort und E-Mail erforderlich' });
        }

        const hash = await bcrypt.hash(password, 12);

        await pool.query(
            'INSERT INTO eeg_admin_users (username, email, password_hash, rolle, eeg_id, berechtigungen) VALUES (?, ?, ?, ?, ?, ?)',
            [username.trim(), email.trim(), hash,
             rolle === 'super_admin' ? 'super_admin' : 'eeg_admin',
             eeg_id || null,
             berechtigungen ? JSON.stringify(berechtigungen) : JSON.stringify({ antraege: true, mitglieder: true, export: true, einstellungen: true })]
        );

        res.json({ success: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username oder E-Mail bereits vergeben' });
        }
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/super-admin/users/:id
router.put('/users/:id', async (req, res) => {
    try {
        const { email, password, rolle, eeg_id, berechtigungen, aktiv } = req.body;

        if (password && password.length > 0) {
            const hash = await bcrypt.hash(password, 12);
            await pool.query(
                'UPDATE eeg_admin_users SET email=?, password_hash=?, rolle=?, eeg_id=?, berechtigungen=?, aktiv=? WHERE id=?',
                [email, hash, rolle || 'eeg_admin', eeg_id || null,
                 JSON.stringify(berechtigungen || {}), aktiv !== undefined ? aktiv : 1, req.params.id]
            );
        } else {
            await pool.query(
                'UPDATE eeg_admin_users SET email=?, rolle=?, eeg_id=?, berechtigungen=?, aktiv=? WHERE id=?',
                [email, rolle || 'eeg_admin', eeg_id || null,
                 JSON.stringify(berechtigungen || {}), aktiv !== undefined ? aktiv : 1, req.params.id]
            );
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// DELETE /api/super-admin/users/:id
router.delete('/users/:id', async (req, res) => {
    try {
        if (parseInt(req.params.id) === req.adminUser.user_id) {
            return res.status(400).json({ error: 'Eigenen Account nicht loeschen' });
        }
        await pool.query('DELETE FROM eeg_admin_sessions WHERE user_id = ?', [req.params.id]);
        await pool.query('DELETE FROM eeg_admin_users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/super-admin/audit-log
router.get('/audit-log', async (req, res) => {
    try {
        const { eeg_id, limit = 100 } = req.query;
        let where = '';
        const params = [];

        if (eeg_id) { where = 'WHERE eeg_id = ?'; params.push(eeg_id); }

        const [logs] = await pool.query(
            `SELECT l.*, u.username FROM eeg_audit_log l
             LEFT JOIN eeg_admin_users u ON u.id = l.user_id
             ${where} ORDER BY l.created_at DESC LIMIT ?`,
            [...params, parseInt(limit)]
        );
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
