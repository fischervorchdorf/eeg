require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

const PORT = process.env.PORT || 3000;
const app = express();

// Trust proxy (Coolify/Docker reverse proxy)
app.set('trust proxy', 1);

// Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://*.r2.cloudflarestorage.com"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS — erlaubt EEG-Subdomains + Embed-Widgets
const allowedOrigins = [
    /https?:\/\/([a-z0-9-]+\.)?eeg-portal\.at$/,
    /https?:\/\/([a-z0-9-]+\.)?vorchdorf\.app$/,
    /https?:\/\/([a-z0-9-]+\.)?regionsapp\.at$/,
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500'
];
// CORS fuer API-Routen (nur erlaubte Origins, mit Credentials)
const apiCors = cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true); // Server-to-Server / same-origin
        const isAllowed = allowedOrigins.some(o =>
            o instanceof RegExp ? o.test(origin) : o === origin
        );
        if (isAllowed) return callback(null, true);
        callback(new Error('CORS nicht erlaubt'));
    },
    credentials: true
});
app.use('/api', apiCors);

// CORS fuer Embed-Widget (jede Origin, aber KEINE Credentials)
app.use('/embed', cors({ origin: true, credentials: false }));

// Rate Limiting fuer Login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

// Rate Limiting fuer Onboarding (Spam-Schutz)
const onboardingLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Zu viele Anfragen. Bitte spaeter erneut versuchen.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiting fuer OCR (teuer, AI-API-Kosten)
const ocrLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, error: 'Zu viele OCR-Anfragen. Bitte kurz warten.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiting fuer Admin-Routen
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, error: 'Zu viele Anfragen.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- STATIC FILES ---
// Admin-Dashboard unter /admin
app.use('/admin', express.static(path.join(__dirname, 'public'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
}));

// Uploads (lokal, nur Dev-Modus — in Produktion via Signed URLs)
if (process.env.NODE_ENV !== 'production') {
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Embed-Widget
app.use('/embed', express.static(path.join(__dirname, '..', 'embed')));

// Onboarding-Frontend (Hauptseite)
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.set('Cache-Control', 'public, max-age=300');
        }
    }
}));

// --- ROUTES ---
const authRouter = require('./src/routes/auth');
const onboardingRouter = require('./src/routes/onboarding');
const applicantRouter = require('./src/routes/applicant');
const adminApplicationsRouter = require('./src/routes/admin-applications');
const adminMembersRouter = require('./src/routes/admin-members');
const adminEegRouter = require('./src/routes/admin-eeg');
const adminExportRouter = require('./src/routes/admin-export');
const adminDashboardRouter = require('./src/routes/admin-dashboard');
const adminImportRouter = require('./src/routes/admin-import');
const superAdminRouter = require('./src/routes/super-admin');
const autofillRouter = require('./src/routes/autofill');
const ocrRouter = require('./src/routes/ocr');
const emailVerifyRouter = require('./src/routes/email-verify');

// Auth
app.use('/api/auth', loginLimiter, authRouter);

// Oeffentliche Onboarding-Routen
app.use('/api/onboarding', onboardingLimiter, onboardingRouter);
app.use('/api/applicant', loginLimiter, applicantRouter);
app.use('/api/autofill', onboardingLimiter, autofillRouter);
app.use('/api/ocr', ocrLimiter, ocrRouter);
app.use('/api/email-verify', onboardingLimiter, emailVerifyRouter);

// Admin-Routen (geschuetzt durch requireLogin Middleware + Rate-Limiting)
app.use('/api/admin/applications', adminLimiter, adminApplicationsRouter);
app.use('/api/admin/members', adminLimiter, adminMembersRouter);
app.use('/api/admin/eeg', adminLimiter, adminEegRouter);
app.use('/api/admin/export', adminLimiter, adminExportRouter);
app.use('/api/admin/dashboard', adminLimiter, adminDashboardRouter);
app.use('/api/admin/import', adminLimiter, adminImportRouter);
app.use('/api/super-admin', adminLimiter, superAdminRouter);

// Root -> Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Catch-all fuer SPA-Routes -> Frontend
app.get('/onboarding', (req, res) => {
    res.sendFile(path.join(frontendPath, 'onboarding.html'));
});
app.get('/status', (req, res) => {
    res.sendFile(path.join(frontendPath, 'status.html'));
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Globaler Error-Handler (keine internen Details an Client)
app.use((err, req, res, next) => {
    if (err.message === 'CORS nicht erlaubt') {
        return res.status(403).json({ error: 'Origin nicht erlaubt' });
    }
    console.error('[ERROR]', err.stack || err.message);
    res.status(err.status || 500).json({ error: 'Serverfehler' });
});

// --- STARTUP ---
async function startServer() {
    try {
        // Migrations ausfuehren
        const { runMigrations } = require('./migrations/run_migrations');
        await runMigrations();
        console.log('[DB] Migrations abgeschlossen.');

        // Cron Jobs starten
        if (process.env.ENABLE_CRON === 'true') {
            require('./src/cron/cleanup-expired');
            require('./src/cron/gdpr-retention');
            console.log('[CRON] Jobs gestartet.');
        }

        app.listen(PORT, () => {
            console.log(`[SERVER] EEG-Portal laeuft auf Port ${PORT}`);
            console.log(`[SERVER] Frontend: http://localhost:${PORT}`);
            console.log(`[SERVER] Admin: http://localhost:${PORT}/admin`);
        });
    } catch (err) {
        console.error('[SERVER] Start fehlgeschlagen:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

startServer();
