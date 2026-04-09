const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requirePermission } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');

router.use(requireLogin);
router.use(requireEegAccess);

// GET /api/admin/applications - Alle Antrage auflisten
router.get('/', requirePermission('antraege'), async (req, res) => {
    try {
        const { status, search, member_type, limit = 50, offset = 0 } = req.query;

        let where = 'WHERE a.geloescht_am IS NULL';
        const params = [];

        if (req.eegId) {
            where += ' AND a.eeg_id = ?';
            params.push(req.eegId);
        }

        if (status) {
            where += ' AND a.status = ?';
            params.push(status);
        }

        if (member_type) {
            where += ' AND mt.key_name = ?';
            params.push(member_type);
        }

        if (search) {
            where += ' AND (a.vorname LIKE ? OR a.nachname LIKE ? OR a.email LIKE ? OR a.firmenname LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }

        const [rows] = await pool.query(
            `SELECT a.id, a.status, a.vorname, a.nachname, a.firmenname, a.email, a.telefon,
                    a.plz, a.ort, a.eingereicht_am, a.genehmigt_am, a.created_at, a.admin_notiz,
                    a.loeschung_angefragt_am,
                    mt.label_de as member_type, mt.key_name as member_type_key,
                    e.name as eeg_name,
                    (SELECT COUNT(*) FROM eeg_zaehlpunkte z WHERE z.application_id = a.id) as zp_count
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             JOIN eeg_tenants e ON a.eeg_id = e.id
             ${where}
             ORDER BY a.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const [countResult] = await pool.query(
            `SELECT COUNT(*) as total FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             ${where}`,
            params
        );

        res.json({ applications: rows, total: countResult[0].total });
    } catch (err) {
        console.error('[ADMIN] Applications list:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/admin/applications/:id - Detail-Ansicht
router.get('/:id', requirePermission('antraege'), async (req, res) => {
    try {
        const [apps] = await pool.query(
            `SELECT a.*, mt.label_de as member_type, mt.key_name as member_type_key,
                    e.name as eeg_name, e.creditor_id
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             JOIN eeg_tenants e ON a.eeg_id = e.id
             WHERE a.id = ?`,
            [req.params.id]
        );

        if (apps.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
        const app = apps[0];
        delete app.passphrase_hash;

        // EEG-Zugriff pruefen
        if (req.eegId && app.eeg_id !== req.eegId) {
            return res.status(403).json({ error: 'Kein Zugriff' });
        }

        const [zaehlpunkte] = await pool.query('SELECT * FROM eeg_zaehlpunkte WHERE application_id = ?', [req.params.id]);
        const [documents] = await pool.query(
            'SELECT id, kategorie, original_name, s3_url, local_path, mime_type, file_size, created_at FROM eeg_documents WHERE application_id = ?',
            [req.params.id]
        );
        const [speicher] = await pool.query('SELECT * FROM eeg_energiespeicher WHERE application_id = ?', [req.params.id]);
        const [consents] = await pool.query('SELECT * FROM eeg_consent_log WHERE application_id = ? ORDER BY created_at', [req.params.id]);

        res.json({ application: app, zaehlpunkte, documents, energiespeicher: speicher, consents });
    } catch (err) {
        console.error('[ADMIN] Application detail:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PATCH /api/admin/applications/:id/status - Status aendern
router.patch('/:id/status', requirePermission('antraege'), async (req, res) => {
    try {
        const { status, admin_notiz } = req.body;
        const validStatuses = ['eingereicht', 'in_pruefung', 'genehmigt', 'abgelehnt', 'aktiv', 'gekuendigt'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Ungueltiger Status' });
        }

        const updates = ['status = ?'];
        const params = [status];

        if (admin_notiz !== undefined) {
            updates.push('admin_notiz = ?');
            params.push(admin_notiz);
        }

        if (status === 'genehmigt' || status === 'aktiv') {
            updates.push('genehmigt_am = NOW()');
        }

        updates.push('bearbeiter_id = ?');
        params.push(req.adminUser.user_id);

        params.push(req.params.id);

        await pool.query(`UPDATE eeg_applications SET ${updates.join(', ')} WHERE id = ?`, params);

        // Audit-Log
        await pool.query(
            `INSERT INTO eeg_audit_log (eeg_id, user_id, aktion, entity_type, entity_id, details, ip_adresse)
             VALUES (?, ?, ?, 'application', ?, ?, ?)`,
            [req.eegId, req.adminUser.user_id, `status_${status}`, req.params.id,
             JSON.stringify({ status, admin_notiz }), req.ip]
        );

        // TODO: Email senden bei Statusaenderung

        res.json({ success: true });
    } catch (err) {
        console.error('[ADMIN] Status change:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/admin/applications/:id/notiz - Admin-Notiz
router.put('/:id/notiz', requirePermission('antraege'), async (req, res) => {
    try {
        await pool.query(
            'UPDATE eeg_applications SET admin_notiz = ? WHERE id = ?',
            [req.body.admin_notiz || '', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
