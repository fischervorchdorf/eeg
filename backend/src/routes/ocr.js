/**
 * OCR-Endpunkt fuer Stromrechnungen
 * Nutzt Google Gemini Flash (Vision) oder Anthropic Claude als Fallback
 * Konfiguration via GEMINI_API_KEY oder ANTHROPIC_API_KEY in .env
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
    }
});

const EXTRACTION_PROMPT = `Du bist ein OCR-Assistent fuer oesterreichische Stromrechnungen.
Extrahiere aus dem beigefuegten Dokument folgende Felder und antworte AUSSCHLIESSLICH mit gueltigem JSON (keine Markdown-Formatierung, keine Erklaerung).

Felder:
- zaehlpunktnummer: 33-stellige Zaehlpunktnummer beginnend mit AT (Format: AT003000... oder aehnlich). Auch "Zaehlpunkt" oder "Zaehlpunktbezeichnung" genannt.
- kundennummer: Kundennummer beim Netzbetreiber/Lieferanten
- vertragskontonummer: Vertragskonto- oder Geschaeftspartnernummer falls vorhanden
- inventarnummer: Zaehler-Inventarnummer / Geraetenummer
- netzbetreiber: Name des Netzbetreibers (z.B. "Netz Oberoesterreich GmbH")
- lieferant: Name des Stromlieferanten (z.B. "Energie AG", "Wien Energie")
- jahresverbrauch_kwh: Jahresstromverbrauch in kWh als Zahl (NICHT als String)
- adresse: { strasse, hausnummer, plz, ort } - Anschrift des Zaehlpunkts
- kunde: { vorname, nachname, firmenname } - Kunde

Wenn ein Feld nicht im Dokument zu finden ist, setze es auf null.
Antworte NUR mit dem JSON-Objekt, sonst nichts.`;

// Gemini Flash via Google AI API — versucht mehrere Modelle der Reihe nach
// Erst verfügbares Modell ermitteln und cachen
let GEMINI_MODEL_CACHE = 'gemini-2.5-flash'; // Direkt mit dem bekannt funktionierenden starten
const GEMINI_MODELS_TO_TRY = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-preview-04-17',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
];

async function fetchWithTimeout(url, options, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function ocrWithGemini(base64, mediaType, apiKey) {
    const part = { inlineData: { mimeType: mediaType, data: base64 } };
    const body = {
        contents: [{ parts: [part, { text: EXTRACTION_PROMPT }] }],
        generationConfig: { maxOutputTokens: 1024 }
    };

    // Gecachtes Modell zuerst versuchen
    const models = GEMINI_MODEL_CACHE
        ? [GEMINI_MODEL_CACHE, ...GEMINI_MODELS_TO_TRY.filter(m => m !== GEMINI_MODEL_CACHE)]
        : GEMINI_MODELS_TO_TRY;

    let lastError;
    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
            const resp = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }, 25000);

            if (resp.status === 404 || resp.status === 400) {
                const msg = await resp.text();
                console.warn(`[OCR] Gemini ${model} nicht verfügbar (${resp.status}), nächstes...`);
                if (GEMINI_MODEL_CACHE === model) GEMINI_MODEL_CACHE = null;
                lastError = new Error(`Gemini ${resp.status} (${model})`);
                continue;
            }

            if (!resp.ok) {
                const errText = await resp.text();
                console.error(`[OCR] Gemini ${model} Fehler:`, resp.status, errText.slice(0, 200));
                lastError = new Error(`Gemini API ${resp.status}`);
                continue;
            }

            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            GEMINI_MODEL_CACHE = model; // Erfolgreiches Modell merken
            console.log(`[OCR] Gemini ${model} erfolgreich`);
            return text;
        } catch (e) {
            lastError = e;
            console.warn(`[OCR] Gemini ${model} Exception:`, e.message);
            if (e.name === 'AbortError') continue; // Timeout → nächstes Modell
        }
    }
    throw lastError || new Error('Alle Gemini-Modelle fehlgeschlagen');
}

// Anthropic Claude als Fallback
async function ocrWithClaude(base64, mediaType, apiKey) {
    const isPdf = mediaType === 'application/pdf';

    const content = isPdf ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: EXTRACTION_PROMPT }
    ] : [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: EXTRACTION_PROMPT }
    ];

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{ role: 'user', content }]
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        console.error('[OCR] Claude API Fehler:', resp.status, errText);
        throw new Error(`Claude API ${resp.status}`);
    }

    const data = await resp.json();
    return data.content?.[0]?.text || '';
}

// POST /api/ocr/stromrechnung - Felder aus Stromrechnung extrahieren
router.post('/stromrechnung', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });

    const geminiKey = process.env.GEMINI_API_KEY;
    const claudeKey = process.env.ANTHROPIC_API_KEY;

    if (!geminiKey && !claudeKey) {
        return res.status(503).json({
            error: 'OCR-Service nicht konfiguriert',
            hint: 'Bitte GEMINI_API_KEY oder ANTHROPIC_API_KEY in .env setzen'
        });
    }

    try {
        let buffer = req.file.buffer;
        let mediaType = req.file.mimetype;

        // Bild optimieren (nicht bei PDF)
        if (mediaType.startsWith('image/')) {
            try {
                buffer = await sharp(buffer)
                    .rotate()
                    .resize(1568, null, { withoutEnlargement: true, fit: 'inside' })
                    .jpeg({ quality: 88 })
                    .toBuffer();
                mediaType = 'image/jpeg';
            } catch (e) {
                console.error('[OCR] Bild-Optimierung:', e.message);
            }
        }

        const base64 = buffer.toString('base64');
        let text;

        if (geminiKey) {
            console.log('[OCR] Verwende Gemini Flash');
            text = await ocrWithGemini(base64, mediaType, geminiKey);
        } else {
            console.log('[OCR] Verwende Claude (kein GEMINI_API_KEY gesetzt)');
            text = await ocrWithClaude(base64, mediaType, claudeKey);
        }

        // JSON-Objekt direkt aus der Antwort extrahieren (robust gegen Markdown, Anführungszeichen etc.)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[OCR] Kein JSON in Antwort:', text.slice(0, 300));
            return res.status(502).json({ error: 'OCR konnte keine Felder extrahieren' });
        }

        let extracted;
        try {
            extracted = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error('[OCR] JSON-Parse Fehler:', e.message);
            return res.status(502).json({ error: 'OCR-Antwort ungueltig' });
        }

        res.json({ success: true, extracted });
    } catch (err) {
        console.error('[OCR] Fehler:', err.message, err.stack);
        res.status(500).json({ error: 'OCR-Service Fehler: ' + err.message });
    }
});

module.exports = router;
