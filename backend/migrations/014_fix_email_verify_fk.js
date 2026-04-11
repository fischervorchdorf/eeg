/**
 * Fix: Foreign Key auf eeg_email_verifications.application_id entfernen
 * und Spalte nullable machen, damit Verifikation ohne Antrag (application_id = NULL) moeglich ist.
 */
async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // FK-Constraint-Name ermitteln
        const [fks] = await conn.query(`
            SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'eeg_email_verifications'
              AND COLUMN_NAME = 'application_id'
              AND REFERENCED_TABLE_NAME = 'eeg_applications'
        `);

        for (const fk of fks) {
            await conn.query(`ALTER TABLE eeg_email_verifications DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
        }

        // application_id nullable machen
        await conn.query(`ALTER TABLE eeg_email_verifications MODIFY application_id INT DEFAULT NULL`);

        // Bestehende 0-Werte auf NULL setzen
        await conn.query(`UPDATE eeg_email_verifications SET application_id = NULL WHERE application_id = 0`);

        await conn.commit();
        console.log('[MIGRATION 014] FK auf email_verifications entfernt, application_id nullable');
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { up };
