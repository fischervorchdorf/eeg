/**
 * Bestehende Sessions loeschen, da Tokens ab jetzt gehasht gespeichert werden.
 * Alle Admins muessen sich neu einloggen.
 */
async function up(pool) {
    await pool.query('DELETE FROM eeg_admin_sessions');
    console.log('[MIGRATION 015] Alle Sessions invalidiert (Token-Hashing eingefuehrt)');
}

module.exports = { up };
