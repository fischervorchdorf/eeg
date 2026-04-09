/**
 * Fixes Umlaute in bestehenden DB-Eintraegen (Tenants + Netzbetreiber + Regionen)
 */
async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Tenant: Buergerenergiegemeinschaft -> Bürgerenergiegemeinschaft
        await conn.query(`
            UPDATE eeg_tenants
            SET name = REPLACE(name, 'Buergerenergiegemeinschaft', 'Bürgerenergiegemeinschaft')
            WHERE name LIKE '%Buergerenergiegemeinschaft%'
        `);
        await conn.query(`
            UPDATE eeg_tenants
            SET sitz = REPLACE(sitz, 'Landstrasse', 'Landstraße')
            WHERE sitz LIKE '%Landstrasse%'
        `);

        // Netzbetreiber: Oesterreich -> Österreich, Kaernten -> Kärnten
        const replacements = [
            ['Oberoesterreich', 'Oberösterreich'],
            ['Niederoesterreich', 'Niederösterreich'],
            ['Kaerntner', 'Kärntner'],
            ['Kaernten', 'Kärnten'],
            ['Oesterreich', 'Österreich']
        ];

        for (const [from, to] of replacements) {
            await conn.query(
                `UPDATE eeg_netzbetreiber SET name = REPLACE(name, ?, ?) WHERE name LIKE ?`,
                [from, to, `%${from}%`]
            );
            await conn.query(
                `UPDATE eeg_netzbetreiber SET region = REPLACE(region, ?, ?) WHERE region LIKE ?`,
                [from, to, `%${from}%`]
            );
        }

        await conn.commit();
        console.log('[MIGRATION 012] Umlaute in bestehenden Daten korrigiert');
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { up };
