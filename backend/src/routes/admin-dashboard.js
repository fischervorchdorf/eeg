const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');

router.use(requireLogin);
router.use(requireEegAccess);

// GET /api/admin/dashboard/stats - Basis-Stats
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

        // Letzte 30 Tage neue Antraege
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

// GET /api/admin/dashboard/statistik - Erweiterte Statistik für Charts
router.get('/statistik', async (req, res) => {
    try {
        const eegWhere = req.eegId ? 'AND a.eeg_id = ?' : '';
        const eegParams = req.eegId ? [req.eegId] : [];

        // 1. KPI Gesamt
        const [[kpi]] = await pool.query(`
            SELECT
                SUM(a.status IN ('genehmigt','aktiv')) as mitglieder,
                COUNT(DISTINCT CASE WHEN z.typ='bezug' AND a.status IN ('genehmigt','aktiv') THEN z.id END) as zp_bezug,
                COUNT(DISTINCT CASE WHEN z.typ='einspeisung' AND a.status IN ('genehmigt','aktiv') THEN z.id END) as zp_einspeisung,
                ROUND(SUM(CASE WHEN z.typ='einspeisung' AND a.status IN ('genehmigt','aktiv') THEN z.pv_leistung_kwp ELSE 0 END), 1) as pv_leistung_kwp,
                ROUND(SUM(CASE WHEN a.status IN ('genehmigt','aktiv') THEN z.jahresverbrauch_kwh ELSE 0 END), 0) as jahresverbrauch_kwh
            FROM eeg_applications a
            LEFT JOIN eeg_zaehlpunkte z ON z.application_id = a.id
            WHERE a.geloescht_am IS NULL ${eegWhere}
        `, eegParams);

        // 2. Speicherkapazität
        const [[speicher]] = await pool.query(`
            SELECT ROUND(SUM(es.kapazitaet_kwh), 1) as speicher_kwh
            FROM eeg_energiespeicher es
            JOIN eeg_applications a ON es.application_id = a.id
            WHERE a.geloescht_am IS NULL AND a.status IN ('genehmigt','aktiv') ${eegWhere}
        `, eegParams);

        // 3. Mitgliederwachstum pro Monat (kumulativ, letzte 24 Monate)
        const [wachstum] = await pool.query(`
            SELECT
                DATE_FORMAT(a.genehmigt_am, '%Y-%m') as monat,
                COUNT(*) as neue_mitglieder
            FROM eeg_applications a
            WHERE a.geloescht_am IS NULL
              AND a.status IN ('genehmigt','aktiv')
              AND a.genehmigt_am IS NOT NULL
              AND a.genehmigt_am >= DATE_SUB(NOW(), INTERVAL 24 MONTH)
              ${eegWhere}
            GROUP BY DATE_FORMAT(a.genehmigt_am, '%Y-%m')
            ORDER BY monat
        `, eegParams);

        // 4. Mitglieder nach Typ (aktiv)
        const [nachTyp] = await pool.query(`
            SELECT mt.label_de as typ, COUNT(*) as count
            FROM eeg_applications a
            JOIN eeg_member_types mt ON a.member_type_id = mt.id
            WHERE a.geloescht_am IS NULL AND a.status IN ('genehmigt','aktiv') ${eegWhere}
            GROUP BY mt.id
            ORDER BY count DESC
        `, eegParams);

        // 5. Antraege pro Monat (letzte 12 Monate, alle Status außer Entwurf)
        const [antraege] = await pool.query(`
            SELECT
                DATE_FORMAT(a.eingereicht_am, '%Y-%m') as monat,
                SUM(a.status IN ('genehmigt','aktiv')) as genehmigt,
                SUM(a.status = 'abgelehnt') as abgelehnt,
                SUM(a.status IN ('eingereicht','in_pruefung')) as offen
            FROM eeg_applications a
            WHERE a.geloescht_am IS NULL
              AND a.eingereicht_am IS NOT NULL
              AND a.eingereicht_am >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
              ${eegWhere}
            GROUP BY DATE_FORMAT(a.eingereicht_am, '%Y-%m')
            ORDER BY monat
        `, eegParams);

        // 6. PV-Leistung Wachstum pro Monat
        const [pvWachstum] = await pool.query(`
            SELECT
                DATE_FORMAT(a.genehmigt_am, '%Y-%m') as monat,
                ROUND(SUM(z.pv_leistung_kwp), 1) as kwp
            FROM eeg_zaehlpunkte z
            JOIN eeg_applications a ON z.application_id = a.id
            WHERE z.typ = 'einspeisung'
              AND a.status IN ('genehmigt','aktiv')
              AND a.genehmigt_am IS NOT NULL
              AND a.genehmigt_am >= DATE_SUB(NOW(), INTERVAL 24 MONTH)
              ${eegWhere}
            GROUP BY DATE_FORMAT(a.genehmigt_am, '%Y-%m')
            ORDER BY monat
        `, eegParams);

        // Kumulatives Wachstum berechnen
        let kumulativ = 0;
        const mitgliederKumulativ = wachstum.map(m => {
            kumulativ += m.neue_mitglieder;
            return { monat: m.monat, gesamt: kumulativ };
        });

        let pvKumulativ = 0;
        const pvKumulativData = pvWachstum.map(m => {
            pvKumulativ += (m.kwp || 0);
            return { monat: m.monat, kwp: Math.round(pvKumulativ * 10) / 10 };
        });

        res.json({
            kpi: {
                mitglieder: kpi.mitglieder || 0,
                zp_bezug: kpi.zp_bezug || 0,
                zp_einspeisung: kpi.zp_einspeisung || 0,
                pv_leistung_kwp: kpi.pv_leistung_kwp || 0,
                jahresverbrauch_kwh: kpi.jahresverbrauch_kwh || 0,
                speicher_kwh: speicher.speicher_kwh || 0
            },
            mitglieder_wachstum: mitgliederKumulativ,
            nach_typ: nachTyp,
            antraege_pro_monat: antraege,
            pv_wachstum: pvKumulativData
        });

    } catch (err) {
        console.error('[DASHBOARD] Statistik:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
