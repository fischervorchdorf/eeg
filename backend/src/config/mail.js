const nodemailer = require('nodemailer');

let transporter = null;
let mailEnabled = false;

try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: parseInt(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        mailEnabled = true;
        console.log('[MAIL] SMTP konfiguriert.');
    } else {
        console.log('[MAIL] Kein SMTP konfiguriert — Emails werden geloggt.');
    }
} catch (err) {
    console.error('[MAIL] Initialisierung fehlgeschlagen:', err.message);
}

async function sendMail({ to, subject, html, text }) {
    if (!mailEnabled) {
        console.log(`[MAIL-LOG] An: ${to} | Betreff: ${subject}`);
        return { messageId: 'local-log' };
    }
    return transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@eeg-portal.at',
        to,
        subject,
        html,
        text
    });
}

module.exports = { sendMail, mailEnabled };
