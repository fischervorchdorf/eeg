async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_netzbetreiber (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                name        VARCHAR(255) NOT NULL,
                region      VARCHAR(100) DEFAULT NULL,
                portal_url  VARCHAR(500) DEFAULT NULL,
                code_prefix VARCHAR(10) DEFAULT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await conn.query(`
            INSERT IGNORE INTO eeg_netzbetreiber (name, region, portal_url, code_prefix) VALUES
            ('Netz Oberösterreich GmbH', 'Oberösterreich', 'https://www.netzooe.at', 'AT003'),
            ('Netz Niederösterreich GmbH', 'Niederösterreich', 'https://www.netz-noe.at', 'AT001'),
            ('Wiener Netze GmbH', 'Wien', 'https://www.wienernetze.at', 'AT002'),
            ('Energienetze Steiermark GmbH', 'Steiermark', 'https://www.e-netze.at', 'AT005'),
            ('Kärntner Netz GmbH', 'Kärnten', 'https://www.kaerntennetz.at', 'AT006'),
            ('Salzburg Netz GmbH', 'Salzburg', 'https://www.salzburgnetz.at', 'AT004'),
            ('Vorarlberger Energienetze GmbH', 'Vorarlberg', 'https://www.vorarlbergnetz.at', 'AT008'),
            ('TINETZ-Tiroler Netze GmbH', 'Tirol', 'https://www.tinetz.at', 'AT007'),
            ('Linz Netz GmbH', 'Linz', 'https://www.linznetz.at', 'AT009'),
            ('Energie Graz GmbH & Co KG', 'Graz', 'https://www.energiegraz.at', 'AT010'),
            ('Energienetz Mitte GmbH', 'Oberösterreich', 'https://www.energienetz-mitte.at', NULL),
            ('Stadtwerke Klagenfurt AG', 'Klagenfurt', NULL, NULL)
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
