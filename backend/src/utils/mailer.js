/**
 * SMTP-Helper via nodemailer
 * Falls SMTP nicht konfiguriert: Console-Log Fallback (Dev-Modus)
 */
const nodemailer = require('nodemailer');

let transporter = null;
let transporterReady = false;

function getTransporter() {
    if (transporter) return transporter;

    if (!process.env.SMTP_HOST) {
        console.warn('[MAILER] Kein SMTP_HOST konfiguriert - Mails werden nur in Konsole geloggt');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: parseInt(process.env.SMTP_PORT || '587') === 465,
        auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        } : undefined
    });
    transporterReady = true;
    return transporter;
}

async function sendMail({ to, subject, html, text }) {
    const t = getTransporter();
    const from = process.env.SMTP_FROM || 'noreply@eeg-portal.at';

    if (!t) {
        // Dev-Fallback: in Konsole loggen
        console.log('========== [MAILER DEV] ==========');
        console.log(`From: ${from}`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Text: ${text || html}`);
        console.log('==================================');
        return { success: true, dev: true };
    }

    try {
        const info = await t.sendMail({ from, to, subject, html, text });
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error('[MAILER] Fehler:', err.message);
        return { success: false, error: err.message };
    }
}

function renderVerificationEmail({ code, eegName, applicationId }) {
    const text = `Hallo,

dein Bestaetigungscode fuer den Beitritt zur ${eegName || 'Energiegemeinschaft'} lautet:

    ${code}

Der Code ist 15 Minuten gueltig.

Falls du diese Anfrage nicht ausgeloest hast, ignoriere diese E-Mail.

Antrags-ID: ${applicationId}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
    <h2 style="color:#2d5a3d;">${eegName || 'Energiegemeinschaft'} - Bestaetigungscode</h2>
    <p>Hallo,</p>
    <p>dein Bestaetigungscode fuer den Beitritt lautet:</p>
    <div style="background:#f4f7f5; border:2px dashed #2d5a3d; padding:24px; text-align:center; margin:24px 0;">
        <div style="font-size:36px; font-weight:bold; letter-spacing:8px; font-family: 'Courier New', monospace; color:#2d5a3d;">
            ${code}
        </div>
    </div>
    <p>Der Code ist <strong>15 Minuten</strong> gueltig.</p>
    <p style="color:#888; font-size:13px;">Falls du diese Anfrage nicht ausgeloest hast, ignoriere diese E-Mail.<br>Antrags-ID: ${applicationId}</p>
</body>
</html>`;

    return { text, html };
}

module.exports = { sendMail, renderVerificationEmail };
