async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_member_types (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                key_name            VARCHAR(50) NOT NULL UNIQUE,
                label_de            VARCHAR(100) NOT NULL,
                icon                VARCHAR(10) DEFAULT NULL,
                needs_uid           TINYINT(1) DEFAULT 0,
                needs_firmenbuch    TINYINT(1) DEFAULT 0,
                ustg_pauschaliert   TINYINT(1) DEFAULT 0,
                reverse_charge      TINYINT(1) DEFAULT 0,
                beschreibung        TEXT DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conn.query(`
            INSERT IGNORE INTO eeg_member_types (key_name, label_de, icon, needs_uid, needs_firmenbuch, ustg_pauschaliert, reverse_charge, beschreibung) VALUES
            ('privatperson', 'Privatperson', NULL, 0, 0, 0, 0,
             'Ich trete als Privatperson bei und betreibe meine Erzeugungsanlage ueberwiegend privat oder als Kleinunternehmen und unterliege nicht der Umsatzsteuerpflicht.'),
            ('unternehmen', 'Unternehmen', NULL, 1, 1, 0, 1,
             'Ich trete als umsatzsteuerpflichtiges Unternehmen bei und betreibe meine Erzeugungsanlage im unternehmerischen Sinn. Meine UID-Nummer wird im Zuge der Anmeldung abgefragt und ist zwingend einzugeben.'),
            ('landwirtschaft', 'Landwirtschaft', NULL, 0, 0, 1, 0,
             'Ich trete mit meiner Landwirtschaft bei und betreibe meine Erzeugungsanlage im Rahmen einer pauschalierten Land- oder Forstwirtschaft und unterliege der Umsatzsteuerpflicht im Sinne des Paragraph 22 UStG.')
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
