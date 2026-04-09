async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_tenants (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                name                VARCHAR(255) NOT NULL,
                slug                VARCHAR(100) NOT NULL UNIQUE,
                domain              VARCHAR(255) DEFAULT NULL UNIQUE,
                zvr_nummer          VARCHAR(50) DEFAULT NULL,
                sitz                VARCHAR(255) DEFAULT NULL,
                kontakt_email       VARCHAR(255) DEFAULT NULL,
                creditor_id         VARCHAR(50) DEFAULT NULL,
                farbe_primary       VARCHAR(7) DEFAULT '#1a73e8',
                farbe_secondary     VARCHAR(7) DEFAULT '#00a86b',
                logo_url            VARCHAR(500) DEFAULT NULL,
                background_url      VARCHAR(500) DEFAULT NULL,
                eintrittsbeitrag_ct INT DEFAULT 2500,
                zusatz_zaehlpunkt_ct INT DEFAULT 1000,
                preis_erzeugung_ct  INT DEFAULT 1100,
                preis_verbrauch_ct  INT DEFAULT 1200,
                mwst_satz           DECIMAL(5,2) DEFAULT 20.00,
                statuten_url        VARCHAR(500) DEFAULT NULL,
                agb_url             VARCHAR(500) DEFAULT NULL,
                datenschutz_url     VARCHAR(500) DEFAULT NULL,
                netzbetreiber_default VARCHAR(255) DEFAULT NULL,
                aktiv               TINYINT(1) DEFAULT 1,
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_slug (slug),
                INDEX idx_domain (domain)
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
