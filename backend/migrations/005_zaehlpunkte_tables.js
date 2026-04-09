async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_zaehlpunkte (
                id                      INT AUTO_INCREMENT PRIMARY KEY,
                application_id          INT NOT NULL,
                typ                     ENUM('bezug','einspeisung') NOT NULL,
                zaehlpunktnummer        VARCHAR(40) NOT NULL,
                strasse                 VARCHAR(200) DEFAULT NULL,
                hausnummer              VARCHAR(20) DEFAULT NULL,
                plz                     VARCHAR(10) DEFAULT NULL,
                ort                     VARCHAR(100) DEFAULT NULL,
                teilnahmefaktor         DECIMAL(5,2) DEFAULT 100.00,
                jahresverbrauch_kwh     INT DEFAULT NULL,
                rueckspeise_limitierung DECIMAL(10,2) DEFAULT NULL,
                pv_leistung_kwp         DECIMAL(10,2) DEFAULT NULL,
                inventarnummer          VARCHAR(100) DEFAULT NULL,
                eda_status              VARCHAR(50) DEFAULT NULL,
                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_app (application_id),
                INDEX idx_zp (zaehlpunktnummer),
                CONSTRAINT fk_zp_app FOREIGN KEY (application_id) REFERENCES eeg_applications(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_energiespeicher (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                application_id  INT NOT NULL,
                typ             VARCHAR(100) DEFAULT NULL,
                kapazitaet_kwh  DECIMAL(10,2) DEFAULT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_es_app FOREIGN KEY (application_id) REFERENCES eeg_applications(id) ON DELETE CASCADE
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
