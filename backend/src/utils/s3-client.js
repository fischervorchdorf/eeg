const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { s3, s3Enabled } = require('../config/s3');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

/**
 * Laedt eine Datei hoch (S3 oder lokal als Fallback)
 */
async function uploadFile(buffer, key, contentType, optimize = false) {
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

        const url = `${process.env.S3_PUBLIC_URL}/${key}`;
        return { s3_key: key, s3_url: url, local_path: null };
    }

    // Lokaler Fallback
    const localDir = path.join(UPLOAD_DIR, path.dirname(key));
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(UPLOAD_DIR, key);
    fs.writeFileSync(localPath, buffer);

    return { s3_key: null, s3_url: null, local_path: `/uploads/${key}` };
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
        const fullPath = path.join(__dirname, '../..', localPath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }
    }
}

module.exports = { uploadFile, deleteFile };
