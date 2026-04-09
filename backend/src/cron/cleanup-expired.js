const pool = require('../config/db');
const { deleteFile } = require('../utils/s3-client');

/**
 * Loescht unvollstaendige Entwuerfe nach 30 Tagen
 * und abgelaufene Admin-Sessions
 */
async function cleanupExpired() {
    console.log('[CRON] Cleanup gestartet...');
    try {
        // Alte Entwuerfe finden (30 Tage)
        const [drafts] = await pool.query(
            "SELECT id FROM eeg_applications WHERE status = 'entwurf' AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)"
        );

        for (const draft of drafts) {
            // Dokumente loeschen
            const [docs] = await pool.query('SELECT s3_key, local_path FROM eeg_documents WHERE application_id = ?', [draft.id]);
            for (const doc of docs) {
                await deleteFile(doc.s3_key, doc.local_path);
            }

            // Antrag und verknuepfte Daten loeschen (CASCADE)
            await pool.query('DELETE FROM eeg_applications WHERE id = ?', [draft.id]);
        }

        if (drafts.length > 0) {
            console.log(`[CRON] ${drafts.length} abgelaufene Entwuerfe geloescht.`);
        }

        // Abgelaufene Sessions loeschen
        const [sessionResult] = await pool.query('DELETE FROM eeg_admin_sessions WHERE laeuft_ab < NOW()');
        if (sessionResult.affectedRows > 0) {
            console.log(`[CRON] ${sessionResult.affectedRows} abgelaufene Sessions geloescht.`);
        }
    } catch (err) {
        console.error('[CRON] Cleanup Fehler:', err.message);
    }
}

// Taeglich um 3:00 Uhr
setInterval(cleanupExpired, 24 * 60 * 60 * 1000);
// Einmal beim Start
setTimeout(cleanupExpired, 10000);

module.exports = { cleanupExpired };
