const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requirePermission } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');
const { createMemberExport, createDigiTalerExport } = require('../utils/excel-export');

router.use(requireLogin);
router.use(requireEegAccess);

// GET /api/admin/export/members - Excel-Export Mitglieder
router.get('/members', requirePermission('export'), async (req, res) => {
    try {
        const { status } = req.query;

        let where = 'WHERE a.geloescht_am IS NULL';
        const params = [];

        if (req.eegId) {
            where += ' AND a.eeg_id = ?';
            params.push(req.eegId);
        }

        if (status) {
            where += ' AND a.status = ?';
            params.push(status);
        } else {
            where += " AND a.status IN ('genehmigt','aktiv')";
        }

        const [members] = await pool.query(
            `SELECT a.*, mt.label_de as member_type,
                    GROUP_CONCAT(CASE WHEN z.typ='bezug' THEN z.zaehlpunktnummer END SEPARATOR ', ') as zp_bezug,
                    GROUP_CONCAT(CASE WHEN z.typ='einspeisung' THEN z.zaehlpunktnummer END SEPARATOR ', ') as zp_einspeisung
             FROM eeg_applications a
             JOIN eeg_member_types mt ON a.member_type_id = mt.id
             LEFT JOIN eeg_zaehlpunkte z ON z.application_id = a.id
             ${where}
             GROUP BY a.id
             ORDER BY a.nachname, a.vorname`,
            params
        );

        const columns = req.query.columns ? req.query.columns.split(',') : null;
        const workbook = await createMemberExport(members, { columns });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=mitglieder-${new Date().toISOString().slice(0,10)}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('[EXPORT] Members:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/admin/export/digi-taler - Digi-Taler CSV Export
router.get('/digi-taler', requirePermission('export'), async (req, res) => {
    try {
        let where = "WHERE a.status IN ('genehmigt','aktiv') AND a.geloescht_am IS NULL";
        const params = [];

        if (req.eegId) {
            where += ' AND a.eeg_id = ?';
            params.push(req.eegId);
        }

        const [members] = await pool.query(
            `SELECT a.vorname, a.nachname, a.email, a.iban
             FROM eeg_applications a ${where}
             ORDER BY a.nachname, a.vorname`,
            params
        );

        // Betrag-Felder muessen noch von aussen befuellt werden
        const data = members.map(m => ({
            ...m,
            betrag_eur: 0,
            betrag_digi: 0,
            anteil_digi: 0
        }));

        const workbook = await createDigiTalerExport(data);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=digi-taler-${new Date().toISOString().slice(0,10)}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('[EXPORT] Digi-Taler:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
