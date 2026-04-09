/**
 * Stellt sicher, dass ein EEG-Admin nur auf seine zugewiesenen EEGs zugreift.
 * Super-Admins koennen auf alle EEGs zugreifen.
 * Setzt req.eegId fuer nachfolgende Handler.
 * Setzt req.eegIds (Array) mit allen erlaubten EEG-IDs.
 */
const pool = require('../config/db');

async function requireEegAccess(req, res, next) {
    const user = req.adminUser;
    if (!user) {
        return res.status(401).json({ error: 'Nicht angemeldet' });
    }

    // Super-Admin: Zugriff auf alle EEGs, kann spezifische per Query waehlen
    if (user.rolle === 'super_admin') {
        const requestedEeg = parseInt(req.query.eeg_id || req.body?.eeg_id) || null;
        req.eegId = requestedEeg;
        req.eegIds = null; // null = alle erlaubt
        return next();
    }

    // EEG-Admin: erlaubte EEGs aus Zwischentabelle laden
    try {
        const [rows] = await pool.query(
            'SELECT eeg_id FROM eeg_admin_user_eegs WHERE user_id = ?',
            [user.user_id]
        );

        const allowedIds = rows.map(r => r.eeg_id);

        // Fallback: altes eeg_id Feld
        if (allowedIds.length === 0 && user.eeg_id) {
            allowedIds.push(user.eeg_id);
        }

        if (allowedIds.length === 0) {
            return res.status(403).json({ error: 'Keine EEG zugewiesen' });
        }

        // Wenn spezifische EEG angefragt wird, prüfen ob erlaubt
        const requestedEeg = parseInt(req.query.eeg_id || req.body?.eeg_id) || null;
        if (requestedEeg) {
            if (!allowedIds.includes(requestedEeg)) {
                return res.status(403).json({ error: 'Kein Zugriff auf diese EEG' });
            }
            req.eegId = requestedEeg;
        } else {
            // Erste EEG als Standard
            req.eegId = allowedIds[0];
        }

        req.eegIds = allowedIds;
        next();
    } catch (err) {
        console.error('[AUTH] EEG-Access:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
}

module.exports = { requireEegAccess };
