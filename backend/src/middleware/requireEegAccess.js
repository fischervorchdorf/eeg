/**
 * Stellt sicher, dass ein EEG-Admin nur auf seine eigene EEG zugreift.
 * Super-Admins koennen auf alle EEGs zugreifen.
 * Setzt req.eegId fuer nachfolgende Handler.
 */
function requireEegAccess(req, res, next) {
    const user = req.adminUser;
    if (!user) {
        return res.status(401).json({ error: 'Nicht angemeldet' });
    }

    // Super-Admin: kann eeg_id per Query oder Body ueberschreiben
    if (user.rolle === 'super_admin') {
        req.eegId = parseInt(req.query.eeg_id || req.body?.eeg_id) || user.eeg_id || null;
        return next();
    }

    // EEG-Admin: nur eigene EEG
    if (!user.eeg_id) {
        return res.status(403).json({ error: 'Kein EEG zugewiesen' });
    }

    req.eegId = user.eeg_id;
    next();
}

module.exports = { requireEegAccess };
