async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_documents (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                application_id  INT NOT NULL,
                kategorie       ENUM('rechnung_verbrauch','gutschrift_einspeisung','lichtbildausweis','zaehler_foto','sonstiges') NOT NULL,
                original_name   VARCHAR(255) NOT NULL,
                s3_key          VARCHAR(500) DEFAULT NULL,
                s3_url          VARCHAR(500) DEFAULT NULL,
                local_path      VARCHAR(500) DEFAULT NULL,
                mime_type       VARCHAR(100) DEFAULT NULL,
                file_size       INT DEFAULT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_app (application_id),
                CONSTRAINT fk_doc_app FOREIGN KEY (application_id) REFERENCES eeg_applications(id) ON DELETE CASCADE
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
