/**
 * Autofill / Lookup-Endpunkte fuer das Onboarding
 * - PLZ -> Ort (via OpenPLZ API)
 * - IBAN -> Bankname (lokale BLZ-Liste)
 * - Zaehlpunktnummer -> Netzbetreiber (via DB)
 * - Adress-Suche (via OpenPLZ / Nominatim Fallback)
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { extractAtBlz, extractNetzbetreiberCode } = require('../utils/validators');

// Bank-Daten einmalig laden
const banksFile = path.join(__dirname, '..', '..', 'data', 'at-banks.json');
let banksData = { ranges: [] };
try {
    banksData = JSON.parse(fs.readFileSync(banksFile, 'utf-8'));
} catch (e) {
    console.error('[AUTOFILL] Bank-Daten konnten nicht geladen werden:', e.message);
}

// In-Memory Cache fuer PLZ-Lookups (12h TTL)
const plzCache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000;

function cacheGet(key) {
    const entry = plzCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > CACHE_TTL) {
        plzCache.delete(key);
        return null;
    }
    return entry.v;
}
function cacheSet(key, value) {
    plzCache.set(key, { t: Date.now(), v: value });
}

// GET /api/autofill/plz/:plz - PLZ -> Ort(e)
router.get('/plz/:plz', async (req, res) => {
    const plz = req.params.plz.trim();
    if (!/^\d{4}$/.test(plz)) {
        return res.status(400).json({ error: 'PLZ muss 4 Ziffern haben' });
    }

    const cached = cacheGet('plz:' + plz);
    if (cached) return res.json(cached);

    try {
        // OpenPLZ API (kostenlos, open data, keine Auth)
        const url = `https://openplzapi.org/at/Localities?postalCode=${plz}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'EEG-Onboarding/1.0' }
        });

        if (!response.ok) throw new Error('OpenPLZ API Fehler ' + response.status);

        const data = await response.json();
        // Format: [{ name, postalCode, federalState: { name }, district: { name } }, ...]
        const result = {
            plz,
            orte: data.map(d => ({
                name: d.name,
                bundesland: d.federalState?.name || null,
                bezirk: d.district?.name || null
            }))
        };

        cacheSet('plz:' + plz, result);
        res.json(result);
    } catch (err) {
        console.error('[AUTOFILL] PLZ-Lookup fehlgeschlagen:', err.message);
        res.status(503).json({ error: 'PLZ-Service derzeit nicht verfuegbar', plz, orte: [] });
    }
});

// GET /api/autofill/strasse?plz=4655&q=hauptstr - Strassen-Suche (OpenPLZ)
router.get('/strasse', async (req, res) => {
    const plz = (req.query.plz || '').trim();
    const q = (req.query.q || '').trim();

    if (!/^\d{4}$/.test(plz)) return res.status(400).json({ error: 'PLZ erforderlich' });
    if (q.length < 2) return res.json({ strassen: [] });

    const cacheKey = `str:${plz}:${q.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
        const url = `https://openplzapi.org/at/Streets?postalCode=${plz}&name=${encodeURIComponent(q)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'EEG-Onboarding/1.0' }
        });

        if (!response.ok) throw new Error('OpenPLZ Strasse Fehler ' + response.status);

        const data = await response.json();
        const result = {
            strassen: data.slice(0, 10).map(d => ({
                name: d.name,
                plz: d.postalCode,
                ort: d.locality
            }))
        };

        cacheSet(cacheKey, result);
        res.json(result);
    } catch (err) {
        console.error('[AUTOFILL] Strasse-Lookup:', err.message);
        res.status(503).json({ error: 'Adress-Service derzeit nicht verfuegbar', strassen: [] });
    }
});

// GET /api/autofill/bank/:iban - IBAN -> Bankname
router.get('/bank/:iban', (req, res) => {
    const iban = req.params.iban;
    const blz = extractAtBlz(iban);

    if (!blz) {
        return res.status(400).json({ error: 'Ungueltige AT-IBAN' });
    }

    const blzNum = parseInt(blz);
    const match = banksData.ranges.find(r => {
        const from = parseInt(r.from);
        const to = parseInt(r.to);
        return blzNum >= from && blzNum <= to;
    });

    if (!match) {
        return res.json({ blz, found: false });
    }

    res.json({
        blz,
        found: true,
        name: match.name,
        bic: match.bic
    });
});

// GET /api/autofill/netzbetreiber/:zp - Zaehlpunktnummer -> Netzbetreiber
router.get('/netzbetreiber/:zp', async (req, res) => {
    const code = extractNetzbetreiberCode(req.params.zp);
    if (!code) {
        return res.status(400).json({ error: 'Ungueltige Zaehlpunktnummer' });
    }

    try {
        // Zuerst im DB-Seed suchen (eeg_netzbetreiber Tabelle, ean_code-Spalte)
        const [rows] = await pool.query(
            'SELECT id, name, region, portal_url, ean_code FROM eeg_netzbetreiber WHERE ean_code = ? LIMIT 1',
            [code]
        ).catch(() => [[]]);

        if (rows && rows.length > 0) {
            return res.json({ code, found: true, ...rows[0] });
        }

        // Fallback: Hardcoded Top-Codes (haeufigste oesterreichische Netzbetreiber)
        const fallback = {
            '003000': { name: 'Energie AG Oberoesterreich Netz GmbH', region: 'Oberoesterreich' },
            '001000': { name: 'Wiener Netze GmbH', region: 'Wien' },
            '002000': { name: 'Netz Niederoesterreich', region: 'Niederoesterreich' },
            '004000': { name: 'Netz Burgenland Strom', region: 'Burgenland' },
            '005000': { name: 'Salzburg Netz', region: 'Salzburg' },
            '006000': { name: 'Netz Oberoesterreich', region: 'Oberoesterreich' },
            '007000': { name: 'Energienetze Steiermark', region: 'Steiermark' },
            '008000': { name: 'TINETZ - Tiroler Netze', region: 'Tirol' },
            '009000': { name: 'Vorarlberger Energienetze', region: 'Vorarlberg' },
            '010000': { name: 'KNG-Kaernten Netz', region: 'Kaernten' },
            '011000': { name: 'Linz Netz GmbH', region: 'Oberoesterreich' },
            '012000': { name: 'Innsbrucker Kommunalbetriebe (IKB)', region: 'Tirol' },
            '013000': { name: 'Energie Klagenfurt Netz', region: 'Kaernten' }
        };

        // Code beginnt mit '00X000' Pattern
        const prefix = code.slice(0, 6);
        if (fallback[prefix]) {
            return res.json({ code, found: true, ...fallback[prefix] });
        }

        res.json({ code, found: false });
    } catch (err) {
        console.error('[AUTOFILL] Netzbetreiber:', err.message);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

module.exports = router;
