const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');

router.use(requireLogin);
router.use(requireEegAccess);

// GET /api/admin/dashboard/stats
router.get('/stats', async (req, res) => {
    try {
        let where = 'WHERE a.geloescht_am IS NULL';
        const params = [];

        if (req.eegId) {
            where += ' AND a.eeg_id = ?';
            params.push(req.eegId);
        }

        const [stats] = await pool.query(
            `SELECT
                COUNT(*) as total,
                SUM(a.status = 'eingereicht') as eingereicht,
                SUM(a.status = 'in_pruefung') as in_pruefung,
                SUM(a.status = 'genehmigt') as genehmigt,
                SUM(a.status = 'abgelehnt') as abgelehnt,
                SUM(a.status IN ('genehmigt','aktiv')) as aktive_mitglieder,
                SUM(a.status = 'entwurf') as entwuerfe,
                SUM(a.loeschung_angefragt_am IS NOT NULL AND a.geloescht_am IS NULL) as loeschung_offen
             FROM eeg_applications a ${where}`,
            params
        );

        // Nach Mitgliedstyp
        const [byType] = await pool.query(
            `SELECT mt.label_de as typ, COUNT(*) as count
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             ${where} AND a.status IN ('genehmigt','aktiv')
             GROUP BY mt.id`,
            params
        );

        // Letzte 7 Tage neue Antrage
        const [recent] = await pool.query(
            `SELECT DATE(a.eingereicht_am) as datum, COUNT(*) as count
             FROM eeg_applications a
             ${where} AND a.eingereicht_am >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             GROUP BY DATE(a.eingereicht_am)
             ORDER BY datum`,
            params
        );

        res.json({
            ...stats[0],
            nach_typ: byType,
            verlauf: recent
        });
    } catch (err) {
        console.error('[DASHBOARD] Stats:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
