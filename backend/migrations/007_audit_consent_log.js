async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_consent_log (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                application_id  INT NOT NULL,
                consent_type    VARCHAR(50) NOT NULL,
                accepted        TINYINT(1) NOT NULL,
                ip_adresse      VARCHAR(45) DEFAULT NULL,
                user_agent      TEXT DEFAULT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_app (application_id),
                CONSTRAINT fk_consent_app FOREIGN KEY (application_id) REFERENCES eeg_applications(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_audit_log (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                eeg_id      INT DEFAULT NULL,
                user_id     INT DEFAULT NULL,
                aktion      VARCHAR(100) NOT NULL,
                entity_type VARCHAR(50) DEFAULT NULL,
                entity_id   INT DEFAULT NULL,
                details     JSON DEFAULT NULL,
                ip_adresse  VARCHAR(45) DEFAULT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_eeg (eeg_id),
                INDEX idx_entity (entity_type, entity_id),
                INDEX idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_system_config (
                config_key      VARCHAR(100) PRIMARY KEY,
                config_value    TEXT DEFAULT NULL,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
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
