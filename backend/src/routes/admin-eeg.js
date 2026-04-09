const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../config/db');
const { requireLogin, requirePermission } = require('../middleware/requireLogin');
const { requireEegAccess } = require('../middleware/requireEegAccess');
const { uploadFile } = require('../utils/s3-client');

router.use(requireLogin);
router.use(requireEegAccess);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        cb(null, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.mimetype));
    }
});

// GET /api/admin/eeg/settings
router.get('/settings', requirePermission('einstellungen'), async (req, res) => {
    try {
        if (!req.eegId) return res.status(400).json({ error: 'Keine EEG zugewiesen' });

        const [eegs] = await pool.query('SELECT * FROM eeg_tenants WHERE id = ?', [req.eegId]);
        if (eegs.length === 0) return res.status(404).json({ error: 'EEG nicht gefunden' });

        res.json(eegs[0]);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/admin/eeg/settings
router.put('/settings', requirePermission('einstellungen'), async (req, res) => {
    try {
        if (!req.eegId) return res.status(400).json({ error: 'Keine EEG zugewiesen' });

        const { name, sitz, kontakt_email, creditor_id, zvr_nummer,
                farbe_primary, farbe_secondary,
                eintrittsbeitrag_ct, zusatz_zaehlpunkt_ct,
                preis_erzeugung_ct, preis_verbrauch_ct, mwst_satz,
                netzbetreiber_default } = req.body;

        await pool.query(
            `UPDATE eeg_tenants SET
                name=COALESCE(?,name), sitz=COALESCE(?,sitz), kontakt_email=COALESCE(?,kontakt_email),
                creditor_id=COALESCE(?,creditor_id), zvr_nummer=COALESCE(?,zvr_nummer),
                farbe_primary=COALESCE(?,farbe_primary), farbe_secondary=COALESCE(?,farbe_secondary),
                eintrittsbeitrag_ct=COALESCE(?,eintrittsbeitrag_ct),
                zusatz_zaehlpunkt_ct=COALESCE(?,zusatz_zaehlpunkt_ct),
                preis_erzeugung_ct=COALESCE(?,preis_erzeugung_ct),
                preis_verbrauch_ct=COALESCE(?,preis_verbrauch_ct),
                mwst_satz=COALESCE(?,mwst_satz),
                netzbetreiber_default=COALESCE(?,netzbetreiber_default)
            WHERE id = ?`,
            [name, sitz, kontakt_email, creditor_id, zvr_nummer,
             farbe_primary, farbe_secondary,
             eintrittsbeitrag_ct, zusatz_zaehlpunkt_ct,
             preis_erzeugung_ct, preis_verbrauch_ct, mwst_satz,
             netzbetreiber_default, req.eegId]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// POST /api/admin/eeg/dokument/:typ - PDF-Upload (statuten, agb, datenschutz, logo, background)
router.post('/dokument/:typ', requirePermission('einstellungen'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Datei erforderlich' });

        const typ = req.params.typ;
        const validTypes = ['statuten', 'agb', 'datenschutz', 'logo', 'background'];
        if (!validTypes.includes(typ)) return res.status(400).json({ error: 'Ungueltiger Dokument-Typ' });

        const [eegs] = await pool.query('SELECT slug FROM eeg_tenants WHERE id = ?', [req.eegId]);
        const slug = eegs[0]?.slug || 'unknown';

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const key = `eeg-legal/${slug}/${typ}-${Date.now()}.${ext}`;

        const isImage = req.file.mimetype.startsWith('image/');
        const uploaded = await uploadFile(req.file.buffer, key, req.file.mimetype, isImage);
        const url = uploaded.s3_url || uploaded.local_path;

        // URL in eeg_tenants speichern
        const column = typ === 'logo' ? 'logo_url' :
                       typ === 'background' ? 'background_url' :
                       `${typ}_url`;

        await pool.query(`UPDATE eeg_tenants SET ${column} = ? WHERE id = ?`, [url, req.eegId]);

        res.json({ success: true, url });
    } catch (err) {
        console.error('[ADMIN] Dokument upload:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// GET /api/admin/eeg/email-templates
router.get('/email-templates', requirePermission('einstellungen'), async (req, res) => {
    try {
        const [templates] = await pool.query(
            `SELECT COALESCE(custom.id, system.id) as id,
                    system.template_key,
                    COALESCE(custom.betreff, system.betreff) as betreff,
                    COALESCE(custom.inhalt_html, system.inhalt_html) as inhalt_html,
                    IF(custom.id IS NOT NULL, 1, 0) as angepasst
             FROM eeg_email_templates system
             LEFT JOIN eeg_email_templates custom ON custom.template_key = system.template_key AND custom.eeg_id = ?
             WHERE system.eeg_id IS NULL`,
            [req.eegId]
        );
        res.json(templates);
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

// PUT /api/admin/eeg/email-templates/:key
router.put('/email-templates/:key', requirePermission('einstellungen'), async (req, res) => {
    try {
        const { betreff, inhalt_html } = req.body;

        await pool.query(
            `INSERT INTO eeg_email_templates (eeg_id, template_key, betreff, inhalt_html)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE betreff = VALUES(betreff), inhalt_html = VALUES(inhalt_html)`,
            [req.eegId, req.params.key, betreff, inhalt_html]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
