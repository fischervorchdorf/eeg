const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3, s3Enabled } = require('../config/s3');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

/**
 * Path-Traversal-Schutz: Key validieren
 */
function sanitizeKey(key) {
    if (key.includes('..') || key.includes('\0')) {
        throw new Error('Ungueltiger Dateipfad');
    }
    return key;
}

/**
 * Laedt eine Datei hoch (S3 oder lokal als Fallback)
 */
async function uploadFile(buffer, key, contentType, optimize = false) {
    key = sanitizeKey(key);

    // Bild-Optimierung
    if (optimize && contentType.startsWith('image/')) {
        try {
            const meta = await sharp(buffer).metadata();
            let pipeline = sharp(buffer).rotate();
            if (meta.width > 1600) {
                pipeline = pipeline.resize(1600, null, { withoutEnlargement: true });
            }
            buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
            contentType = 'image/jpeg';
        } catch (err) {
            console.error('[S3] Bild-Optimierung fehlgeschlagen:', err.message);
        }
    }

    if (s3Enabled) {
        await s3.send(new PutObjectCommand({
            Bucket: process.env.S3_BUCKET || 'eeg-portal',
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable'
        }));

        return { s3_key: key, s3_url: null, local_path: null };
    }

    // Lokaler Fallback (nur Dev-Modus)
    const localDir = path.join(UPLOAD_DIR, path.dirname(key));
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(UPLOAD_DIR, key);
    fs.writeFileSync(localPath, buffer);

    return { s3_key: null, s3_url: null, local_path: `/uploads/${key}` };
}

/**
 * Signed URL fuer S3-Objekt generieren (15 Minuten gueltig)
 */
async function getDocumentUrl(s3Key, localPath) {
    if (s3Enabled && s3Key) {
        const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET || 'eeg-portal',
            Key: s3Key
        });
        return await getSignedUrl(s3, command, { expiresIn: 900 });
    }
    // Lokaler Fallback (Dev)
    return localPath || null;
}

/**
 * Loescht eine Datei
 */
async function deleteFile(key, localPath) {
    if (s3Enabled && key) {
        try {
            await s3.send(new DeleteObjectCommand({
                Bucket: process.env.S3_BUCKET || 'eeg-portal',
                Key: key
            }));
        } catch (err) {
            console.error('[S3] Loeschen fehlgeschlagen:', err.message);
        }
    }

    if (localPath) {
        const safePath = path.resolve(UPLOAD_DIR, path.basename(localPath));
        if (safePath.startsWith(UPLOAD_DIR) && fs.existsSync(safePath)) {
            fs.unlinkSync(safePath);
        }
    }
}

module.exports = { uploadFile, deleteFile, getDocumentUrl };
