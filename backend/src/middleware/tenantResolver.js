const pool = require('../config/db');

// Cache fuer Tenant-Daten (5 Minuten)
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getTenantBySlug(slug) {
    const cached = tenantCache.get(`slug:${slug}`);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const [rows] = await pool.query(
        'SELECT * FROM eeg_tenants WHERE slug = ? AND aktiv = 1 LIMIT 1',
        [slug]
    );
    const tenant = rows[0] || null;
    tenantCache.set(`slug:${slug}`, { data: tenant, ts: Date.now() });
    return tenant;
}

async function getTenantByDomain(domain) {
    const cached = tenantCache.get(`domain:${domain}`);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const [rows] = await pool.query(
        'SELECT * FROM eeg_tenants WHERE domain = ? AND aktiv = 1 LIMIT 1',
        [domain]
    );
    const tenant = rows[0] || null;
    tenantCache.set(`domain:${domain}`, { data: tenant, ts: Date.now() });
    return tenant;
}

/**
 * Middleware: Loest den EEG-Tenant auf.
 * Reihenfolge:
 * 1. Query-Parameter ?eeg=slug
 * 2. Subdomain (slug.eeg-portal.at)
 * 3. Custom-Domain
 */
function tenantResolver(req, res, next) {
    // Nur fuer oeffentliche Onboarding-Routes noetig
    // Admin-Routes nutzen requireEegAccess stattdessen
    const resolve = async () => {
        let tenant = null;

        // 1. Query-Parameter
        if (req.query.eeg) {
            tenant = await getTenantBySlug(req.query.eeg);
        }

        // 2. Subdomain
        if (!tenant && req.hostname) {
            const parts = req.hostname.split('.');
            if (parts.length >= 3) {
                // z.B. netzwerk-zukunft.eeg-portal.at
                tenant = await getTenantBySlug(parts[0]);
            }
        }

        // 3. Custom-Domain
        if (!tenant && req.hostname) {
            tenant = await getTenantByDomain(req.hostname);
        }

        req.tenant = tenant;
        next();
    };

    resolve().catch(err => {
        console.error('[TENANT] Fehler:', err.message);
        next();
    });
}

module.exports = { tenantResolver, getTenantBySlug };
