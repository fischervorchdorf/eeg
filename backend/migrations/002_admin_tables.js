async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_admin_users (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                eeg_id          INT DEFAULT NULL,
                username        VARCHAR(100) NOT NULL UNIQUE,
                email           VARCHAR(255) NOT NULL UNIQUE,
                password_hash   VARCHAR(255) NOT NULL,
                rolle           ENUM('super_admin', 'eeg_admin') NOT NULL DEFAULT 'eeg_admin',
                berechtigungen  JSON DEFAULT NULL,
                aktiv           TINYINT(1) DEFAULT 1,
                letzter_login   DATETIME DEFAULT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_eeg_id (eeg_id),
                CONSTRAINT fk_admin_eeg FOREIGN KEY (eeg_id) REFERENCES eeg_tenants(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_admin_sessions (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                user_id     INT NOT NULL,
                token       VARCHAR(255) NOT NULL UNIQUE,
                ip_adresse  VARCHAR(45) DEFAULT NULL,
                user_agent  TEXT DEFAULT NULL,
                erstellt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                laeuft_ab   DATETIME NOT NULL,
                INDEX idx_token (token),
                CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES eeg_admin_users(id) ON DELETE CASCADE
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
