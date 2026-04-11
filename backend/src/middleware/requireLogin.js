const crypto = require('crypto');
const pool = require('../config/db');

async function requireLogin(req, res, next) {
    const token = (req.cookies && req.cookies['eeg_admin_session']) ||
                  req.headers['x-session-token'] ||
                  null;

    if (!token) {
        return res.status(401).json({ error: 'Nicht angemeldet' });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const [sessions] = await pool.query(
            `SELECT s.id, s.user_id, s.laeuft_ab,
                    u.username, u.email, u.rolle, u.eeg_id, u.berechtigungen, u.aktiv
             FROM eeg_admin_sessions s
             JOIN eeg_admin_users u ON s.user_id = u.id
             WHERE s.token = ? AND s.laeuft_ab > NOW() LIMIT 1`,
            [tokenHash]
        );

        if (sessions.length === 0) {
            return res.status(401).json({ error: 'Session abgelaufen' });
        }

        if (!sessions[0].aktiv) {
            return res.status(403).json({ error: 'Benutzer deaktiviert' });
        }

        // Berechtigungen als Objekt parsen
        const user = sessions[0];
        if (typeof user.berechtigungen === 'string') {
            try { user.berechtigungen = JSON.parse(user.berechtigungen); }
            catch { user.berechtigungen = {}; }
        }
        user.berechtigungen = user.berechtigungen || {};

        req.adminUser = user;
        next();
    } catch (err) {
        console.error('[AUTH] Fehler:', err.message);
        res.status(500).json({ error: 'Authentifizierungsfehler' });
    }
}

function requireSuperAdmin(req, res, next) {
    if (!req.adminUser || req.adminUser.rolle !== 'super_admin') {
        return res.status(403).json({ error: 'Nur fuer Super-Admins' });
    }
    next();
}

function requirePermission(key) {
    return (req, res, next) => {
        if (req.adminUser.rolle === 'super_admin') return next();
        const perms = req.adminUser.berechtigungen || {};
        if (!perms[key]) {
            return res.status(403).json({ error: `Keine Berechtigung: ${key}` });
        }
        next();
    };
}

module.exports = { requireLogin, requireSuperAdmin, requirePermission };
