/**
 * Migration 013: Admin-User können mehreren EEGs zugewiesen werden
 * Neue Tabelle eeg_admin_user_eegs (n:m)
 * Das alte eeg_id Feld in eeg_admin_users bleibt für Rückwärtskompatibilität
 */
async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Neue n:m Tabelle
        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_admin_user_eegs (
                user_id     INT NOT NULL,
                eeg_id      INT NOT NULL,
                PRIMARY KEY (user_id, eeg_id),
                CONSTRAINT fk_aue_user FOREIGN KEY (user_id) REFERENCES eeg_admin_users(id) ON DELETE CASCADE,
                CONSTRAINT fk_aue_eeg  FOREIGN KEY (eeg_id)  REFERENCES eeg_tenants(id)    ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Bestehende eeg_id Einträge in neue Tabelle migrieren
        await conn.query(`
            INSERT IGNORE INTO eeg_admin_user_eegs (user_id, eeg_id)
            SELECT id, eeg_id FROM eeg_admin_users
            WHERE eeg_id IS NOT NULL
        `);

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { up };
