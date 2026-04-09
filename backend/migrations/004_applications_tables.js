async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_applications (
                id                      INT AUTO_INCREMENT PRIMARY KEY,
                eeg_id                  INT NOT NULL,
                member_type_id          INT NOT NULL,
                status                  ENUM('entwurf','eingereicht','in_pruefung','genehmigt','abgelehnt','aktiv','gekuendigt') DEFAULT 'entwurf',
                current_step            TINYINT DEFAULT 1,
                passphrase_hash         VARCHAR(255) NOT NULL,
                -- Persoenliche Daten
                titel                   VARCHAR(20) DEFAULT NULL,
                vorname                 VARCHAR(100) DEFAULT NULL,
                nachname                VARCHAR(100) DEFAULT NULL,
                postname                VARCHAR(100) DEFAULT NULL,
                strasse                 VARCHAR(200) DEFAULT NULL,
                hausnummer              VARCHAR(20) DEFAULT NULL,
                plz                     VARCHAR(10) DEFAULT NULL,
                ort                     VARCHAR(100) DEFAULT NULL,
                -- Identitaet
                ausweis_typ             VARCHAR(50) DEFAULT NULL,
                ausweisnummer           VARCHAR(100) DEFAULT NULL,
                geburtsdatum            DATE DEFAULT NULL,
                -- Kontakt
                telefon                 VARCHAR(30) DEFAULT NULL,
                email                   VARCHAR(255) DEFAULT NULL,
                -- Unternehmen (nullable)
                firmenname              VARCHAR(255) DEFAULT NULL,
                uid_nummer              VARCHAR(20) DEFAULT NULL,
                firmenbuchnummer        VARCHAR(50) DEFAULT NULL,
                -- Zahlung
                kontoinhaber            VARCHAR(200) DEFAULT NULL,
                iban                    VARCHAR(34) DEFAULT NULL,
                bankname                VARCHAR(200) DEFAULT NULL,
                sepa_akzeptiert         TINYINT(1) DEFAULT 0,
                -- Bestaetigungen
                statuten_akzeptiert     TINYINT(1) DEFAULT 0,
                agb_akzeptiert          TINYINT(1) DEFAULT 0,
                datenschutz_akzeptiert  TINYINT(1) DEFAULT 0,
                netzbetreiber_vollmacht TINYINT(1) DEFAULT 0,
                kundennummer_netzbetreiber VARCHAR(100) DEFAULT NULL,
                inventarnummer_zaehler  VARCHAR(100) DEFAULT NULL,
                -- Freiwillige Angaben
                eauto_anzahl            INT DEFAULT NULL,
                eauto_batteriekapazitaet DECIMAL(10,2) DEFAULT NULL,
                eauto_jahreskilometer   INT DEFAULT NULL,
                warmwasser_typ          VARCHAR(50) DEFAULT NULL,
                -- Admin
                admin_notiz             TEXT DEFAULT NULL,
                bearbeiter_id           INT DEFAULT NULL,
                -- Timestamps
                eingereicht_am          DATETIME DEFAULT NULL,
                genehmigt_am            DATETIME DEFAULT NULL,
                created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                -- DSGVO
                loeschung_angefragt_am  DATETIME DEFAULT NULL,
                geloescht_am            DATETIME DEFAULT NULL,
                --
                INDEX idx_eeg_id (eeg_id),
                INDEX idx_status (status),
                INDEX idx_email (email),
                INDEX idx_eingereicht (eingereicht_am),
                CONSTRAINT fk_app_eeg FOREIGN KEY (eeg_id) REFERENCES eeg_tenants(id),
                CONSTRAINT fk_app_type FOREIGN KEY (member_type_id) REFERENCES eeg_member_types(id)
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
