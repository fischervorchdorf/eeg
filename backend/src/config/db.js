const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// SSL: standardmaessig aktiviert mit Zertifikatspruefung
// Nur mit DB_SSL=false komplett deaktivieren (lokale Entwicklung)
if (process.env.DB_SSL !== 'false') {
    dbConfig.ssl = {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
}

const pool = mysql.createPool(dbConfig);

module.exports = pool;
