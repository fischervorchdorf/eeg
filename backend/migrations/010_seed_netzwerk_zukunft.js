const bcrypt = require('bcrypt');

async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // BEG Netzwerk Zukunft als Test-Tenant
        await conn.query(`
            INSERT IGNORE INTO eeg_tenants (id, name, slug, sitz, zvr_nummer, kontakt_email, creditor_id,
                farbe_primary, farbe_secondary,
                eintrittsbeitrag_ct, zusatz_zaehlpunkt_ct, preis_erzeugung_ct, preis_verbrauch_ct, mwst_satz,
                aktiv)
            VALUES (1,
                'Buergerenergiegemeinschaft Netzwerk Zukunft',
                'netzwerk-zukunft',
                '4655 Vorchdorf, Neue Landstrasse 27',
                '1446617102',
                'beg-netzwerk-zukunft@kem-traunsteinregion.at',
                'AT32ZZZ00000080064',
                '#2c7be5', '#00a8a8',
                2500, 1000, 1100, 1200, 20.00,
                1)
        `);

        // Super-Admin User (Passwort: admin123 - MUSS geaendert werden!)
        const hash = await bcrypt.hash('admin123', 12);
        await conn.query(`
            INSERT IGNORE INTO eeg_admin_users (id, username, email, password_hash, rolle, eeg_id, berechtigungen, aktiv)
            VALUES
            (1, 'superadmin', 'admin@eeg-portal.at', ?, 'super_admin', NULL, '{}', 1),
            (2, 'netzwerk-admin', 'admin@netzwerk-zukunft.at', ?, 'eeg_admin', 1,
             '{"antraege":true,"mitglieder":true,"export":true,"einstellungen":true}', 1)
        `, [hash, hash]);

        await conn.commit();
        console.log('[SEED] BEG Netzwerk Zukunft + Admin-User erstellt.');
        console.log('[SEED] WICHTIG: Passwort "admin123" sofort aendern!');
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { up };
