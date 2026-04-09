/**
 * Migration-Runner fuer EEG-Portal
 * Fuehrt alle Migrations-Scripts in Reihenfolge aus.
 * Bereits ausgefuehrte Migrations werden uebersprungen.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../src/config/db');
const path = require('path');
const fs = require('fs');

async function runMigrations() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS db_migrations (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            filename       VARCHAR(255) NOT NULL UNIQUE,
            ausgefuehrt_am TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [done] = await pool.query('SELECT filename FROM db_migrations');
    const doneSet = new Set(done.map(r => r.filename));

    const files = fs.readdirSync(__dirname)
        .filter(f => /^\d{3}_.*\.js$/.test(f))
        .sort();

    let count = 0;
    for (const file of files) {
        if (doneSet.has(file)) continue;

        console.log(`[MIGRATION] ${file} ...`);
        try {
            const migration = require(path.join(__dirname, file));
            await migration.up(pool);
            await pool.query('INSERT INTO db_migrations (filename) VALUES (?)', [file]);
            console.log(`[MIGRATION] ${file} OK`);
            count++;
        } catch (err) {
            console.error(`[MIGRATION] ${file} FEHLER:`, err.message);
            throw err;
        }
    }

    if (count === 0) {
        console.log('[MIGRATION] Alle Migrations bereits ausgefuehrt.');
    } else {
        console.log(`[MIGRATION] ${count} Migration(en) erfolgreich.`);
    }
}

module.exports = { runMigrations };

if (require.main === module) {
    runMigrations()
        .then(() => { console.log('Fertig.'); process.exit(0); })
        .catch(err => { console.error('Fehler:', err.message); process.exit(1); });
}
