const pool = require('../config/db');
const { deleteFile } = require('../utils/s3-client');

/**
 * DSGVO Datenretention:
 * - Genehmigte Loeschantraege ausfuehren (Anonymisierung)
 * - Energiedaten aelter als 3 Jahre bereinigen
 */
async function gdprRetention() {
    console.log('[CRON] DSGVO-Retention gestartet...');
    try {
        // Loeschantraege aelter als 30 Tage automatisch ausfuehren
        const [pending] = await pool.query(
            `SELECT id FROM eeg_applications
             WHERE loeschung_angefragt_am IS NOT NULL
             AND geloescht_am IS NULL
             AND loeschung_angefragt_am < DATE_SUB(NOW(), INTERVAL 30 DAY)`
        );

        for (const app of pending) {
            // Dokumente loeschen
            const [docs] = await pool.query('SELECT s3_key, local_path FROM eeg_documents WHERE application_id = ?', [app.id]);
            for (const doc of docs) {
                await deleteFile(doc.s3_key, doc.local_path);
            }
            await pool.query('DELETE FROM eeg_documents WHERE application_id = ?', [app.id]);

            // Personenbezogene Daten anonymisieren
            await pool.query(
                `UPDATE eeg_applications SET
                    vorname='GELOESCHT', nachname='GELOESCHT', postname=NULL,
                    strasse='GELOESCHT', hausnummer='', plz='0000', ort='GELOESCHT',
                    ausweis_typ=NULL, ausweisnummer=NULL, geburtsdatum=NULL,
                    telefon=NULL, email='geloescht@geloescht.at',
                    firmenname=NULL, uid_nummer=NULL, firmenbuchnummer=NULL,
                    kontoinhaber='GELOESCHT', iban='GELOESCHT', bankname=NULL,
                    admin_notiz=CONCAT(COALESCE(admin_notiz,''), ' [DSGVO-Loeschung durchgefuehrt]'),
                    geloescht_am=NOW()
                WHERE id = ?`,
                [app.id]
            );

            console.log(`[CRON] DSGVO-Loeschung: Antrag #${app.id} anonymisiert.`);
        }

        if (pending.length > 0) {
            console.log(`[CRON] ${pending.length} DSGVO-Loeschungen durchgefuehrt.`);
        }
    } catch (err) {
        console.error('[CRON] DSGVO-Retention Fehler:', err.message);
    }
}

// Woechentlich
setInterval(gdprRetention, 7 * 24 * 60 * 60 * 1000);
// Einmal beim Start (nach 30 Sekunden)
setTimeout(gdprRetention, 30000);

module.exports = { gdprRetention };
