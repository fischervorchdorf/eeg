const { S3Client } = require('@aws-sdk/client-s3');

let s3 = null;
let s3Enabled = false;

try {
    if (process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID) {
        s3 = new S3Client({
            region: 'auto',
            endpoint: process.env.S3_ENDPOINT,
            credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
            }
        });
        s3Enabled = true;
        console.log('[S3] Cloudflare R2 verbunden.');
    } else {
        console.log('[S3] Kein S3-Endpoint konfiguriert — lokaler Fallback aktiv.');
    }
} catch (err) {
    console.error('[S3] Initialisierung fehlgeschlagen:', err.message);
}

module.exports = { s3, s3Enabled };
