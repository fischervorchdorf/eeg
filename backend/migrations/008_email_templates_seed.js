async function up(pool) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        await conn.query(`
            CREATE TABLE IF NOT EXISTS eeg_email_templates (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                eeg_id          INT DEFAULT NULL,
                template_key    VARCHAR(50) NOT NULL,
                betreff         VARCHAR(255) NOT NULL,
                inhalt_html     TEXT NOT NULL,
                inhalt_text     TEXT DEFAULT NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uk_eeg_template (eeg_id, template_key),
                CONSTRAINT fk_tpl_eeg FOREIGN KEY (eeg_id) REFERENCES eeg_tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // System-weite Standard-Vorlagen (eeg_id = NULL)
        await conn.query(`
            INSERT IGNORE INTO eeg_email_templates (eeg_id, template_key, betreff, inhalt_html, inhalt_text) VALUES
            (NULL, 'application_received', 'Deine Anmeldung bei {{eeg_name}}',
             '<h2>Hallo {{vorname}},</h2><p>vielen Dank fuer deine Anmeldung bei <strong>{{eeg_name}}</strong>!</p><p>Dein Antrag wurde erfolgreich eingereicht und wird nun geprueft.</p><p>Deine Passphrase fuer den Status-Check: <strong>{{passphrase}}</strong></p><p>Bitte bewahre diese gut auf!</p><p>Mit freundlichen Gruessen,<br>{{eeg_name}}</p>',
             'Hallo {{vorname}}, vielen Dank fuer deine Anmeldung bei {{eeg_name}}. Dein Antrag wird geprueft. Passphrase: {{passphrase}}'),
            (NULL, 'application_approved', 'Willkommen bei {{eeg_name}}!',
             '<h2>Hallo {{vorname}},</h2><p>dein Antrag bei <strong>{{eeg_name}}</strong> wurde genehmigt!</p><p>Du bist nun offizielles Mitglied unserer Energiegemeinschaft.</p><p>Mit freundlichen Gruessen,<br>{{eeg_name}}</p>',
             'Hallo {{vorname}}, dein Antrag bei {{eeg_name}} wurde genehmigt! Willkommen!'),
            (NULL, 'application_rejected', 'Info zu deinem Antrag bei {{eeg_name}}',
             '<h2>Hallo {{vorname}},</h2><p>leider konnten wir deinen Antrag bei <strong>{{eeg_name}}</strong> derzeit nicht genehmigen.</p><p>{{admin_notiz}}</p><p>Bei Fragen wende dich bitte an: {{kontakt_email}}</p><p>Mit freundlichen Gruessen,<br>{{eeg_name}}</p>',
             'Hallo {{vorname}}, leider konnten wir deinen Antrag bei {{eeg_name}} derzeit nicht genehmigen. {{admin_notiz}}'),
            (NULL, 'admin_new_application', 'Neuer Antrag bei {{eeg_name}}',
             '<h2>Neuer Antrag eingegangen</h2><p><strong>{{vorname}} {{nachname}}</strong> hat sich bei {{eeg_name}} als {{member_type}} angemeldet.</p><p><a href="{{admin_url}}">Zum Admin-Dashboard</a></p>',
             'Neuer Antrag: {{vorname}} {{nachname}} bei {{eeg_name}} als {{member_type}}.')
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
