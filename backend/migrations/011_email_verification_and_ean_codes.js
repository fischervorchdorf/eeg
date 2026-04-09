/**
 * E-Mail-Verifikation Tabelle + ean_code Spalte fuer Netzbetreiber
 * + email_verified Spalte fuer Applications
 */
async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // E-Mail-Verifikation Tabelle (6-stelliger Code, 15 min gueltig)
        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_email_verifications (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                application_id  INT NOT NULL,
                email           VARCHAR(255) NOT NULL,
                code_hash       VARCHAR(255) NOT NULL,
                attempts        INT DEFAULT 0,
                verified        TINYINT(1) DEFAULT 0,
                expires_at      DATETIME NOT NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_app (application_id),
                INDEX idx_expires (expires_at),
                FOREIGN KEY (application_id) REFERENCES eeg_applications(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // email_verified Spalte zu Applications hinzufuegen
        const [cols] = await conn.query(
            "SHOW COLUMNS FROM eeg_applications LIKE 'email_verified'"
        );
        if (cols.length === 0) {
            await conn.query(
                'ALTER TABLE eeg_applications ADD COLUMN email_verified TINYINT(1) DEFAULT 0 AFTER email'
            );
        }

        // ean_code Spalte zu Netzbetreiber hinzufuegen (6-stellig, fuer Code-Lookup)
        const [cols2] = await conn.query(
            "SHOW COLUMNS FROM eeg_netzbetreiber LIKE 'ean_code'"
        );
        if (cols2.length === 0) {
            await conn.query(
                'ALTER TABLE eeg_netzbetreiber ADD COLUMN ean_code VARCHAR(10) DEFAULT NULL AFTER code_prefix'
            );

            // EAN-Codes fuer haeufigste Netzbetreiber befuellen
            await conn.query(`
                UPDATE eeg_netzbetreiber SET ean_code = '003000' WHERE name LIKE '%Netz Oberoesterreich%' OR name LIKE '%Energie AG%';
            `);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '001000' WHERE name LIKE '%Wiener Netze%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '002000' WHERE name LIKE '%Niederoesterreich%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '004000' WHERE name LIKE '%Burgenland%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '005000' WHERE name LIKE '%Salzburg%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '007000' WHERE name LIKE '%Steiermark%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '008000' WHERE name LIKE '%Tirol%' OR name LIKE '%TINETZ%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '009000' WHERE name LIKE '%Vorarlberg%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '010000' WHERE name LIKE '%Kaernten%';`);
            await conn.query(`UPDATE eeg_netzbetreiber SET ean_code = '011000' WHERE name LIKE '%Linz%';`);
        }

        await conn.commit();
        console.log('[MIGRATION 011] Email-Verifikation + EAN-Codes erstellt');
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { up };
