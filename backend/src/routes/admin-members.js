const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requirePermission } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');

router.use(requireLogin);
router.use(requireEegAccess);

// GET /api/admin/members - Aktive Mitglieder
router.get('/', requirePermission('mitglieder'), async (req, res) => {
    try {
        const { search } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 100, 200);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);

        let where = "WHERE a.status IN ('genehmigt','aktiv') AND a.geloescht_am IS NULL";
        const params = [];

        if (req.eegId) {
            where += ' AND a.eeg_id = ?';
            params.push(req.eegId);
        }

        if (search) {
            where += ' AND (a.vorname LIKE ? OR a.nachname LIKE ? OR a.email LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        const [members] = await pool.query(
            `SELECT a.id, a.vorname, a.nachname, a.firmenname, a.email, a.telefon,
                    a.strasse, a.hausnummer, a.plz, a.ort, a.iban, a.kontoinhaber,
                    a.status, a.genehmigt_am,
                    mt.label_de as member_type,
                    GROUP_CONCAT(CASE WHEN z.typ='bezug' THEN z.zaehlpunktnummer END) as zp_bezug,
                    GROUP_CONCAT(CASE WHEN z.typ='einspeisung' THEN z.zaehlpunktnummer END) as zp_einspeisung
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             LEFT JOIN eeg_zaehlpunkte z ON z.application_id = a.id
             ${where}
             GROUP BY a.id
             ORDER BY a.nachname, a.vorname
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({ members });
    } catch (err) {
        console.error('[ADMIN] Members:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/admin/members/:id - Mitglied-Detail
router.get('/:id', requirePermission('mitglieder'), async (req, res) => {
    try {
        const [members] = await pool.query(
            `SELECT a.*, mt.label_de as member_type
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             WHERE a.id = ? AND a.status IN ('genehmigt','aktiv')`,
            [req.params.id]
        );

        if (members.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });

        const member = members[0];
        delete member.passphrase_hash;

        if (req.eegId && member.eeg_id !== req.eegId) {
            return res.status(403).json({ error: 'Kein Zugriff' });
        }

        const [zps] = await pool.query('SELECT * FROM eeg_zaehlpunkte WHERE application_id = ?', [req.params.id]);

        res.json({ member, zaehlpunkte: zps });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/admin/members/:id/kuendigung
router.post('/:id/kuendigung', requirePermission('mitglieder'), async (req, res) => {
    try {
        // EEG-Scoping: pruefen ob Mitglied zur eigenen EEG gehoert
        if (req.eegId) {
            const [check] = await pool.query('SELECT eeg_id FROM eeg_applications WHERE id = ?', [req.params.id]);
            if (!check.length || check[0].eeg_id !== req.eegId) {
                return res.status(403).json({ error: 'Kein Zugriff auf dieses Mitglied' });
            }
        }

        const { grund } = req.body;

        await pool.query(
            "UPDATE eeg_applications SET status = 'gekuendigt', admin_notiz = CONCAT(COALESCE(admin_notiz,''), '\nKuendigung: ', ?) WHERE id = ?",
            [grund || 'Ohne Angabe', req.params.id]
        );

        await pool.query(
            `INSERT INTO eeg_audit_log (eeg_id, user_id, aktion, entity_type, entity_id, details, ip_adresse)
             VALUES (?, ?, 'mitglied_gekuendigt', 'application', ?, ?, ?)`,
            [req.eegId, req.adminUser.user_id, req.params.id, JSON.stringify({ grund }), req.ip]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
