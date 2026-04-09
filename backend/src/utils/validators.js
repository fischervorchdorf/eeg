/**
 * Validierungen fuer oesterreichische EEG-Daten
 * Alle Funktionen geben { valid: boolean, error?: string } zurueck
 */

// E-Mail
function validateEmail(email) {
    if (!email) return { valid: false, error: 'E-Mail ist erforderlich' };
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return { valid: false, error: 'Ungueltige E-Mail-Adresse' };
    return { valid: true };
}

// Oesterreichische IBAN (AT + 18 Ziffern = 20 Zeichen) mit MOD-97
function validateIBAN(iban) {
    if (!iban) return { valid: false, error: 'IBAN ist erforderlich' };
    const clean = iban.replace(/\s/g, '').toUpperCase();

    if (!/^AT\d{18}$/.test(clean)) {
        return { valid: false, error: 'IBAN muss mit AT beginnen und 20 Zeichen haben' };
    }

    // MOD-97 Pruefung (ISO 13616)
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());

    let remainder = '';
    for (const digit of numeric) {
        remainder += digit;
        remainder = (parseInt(remainder) % 97).toString();
    }

    if (parseInt(remainder) !== 1) {
        return { valid: false, error: 'IBAN Pruefziffer ungueltig' };
    }

    return { valid: true, formatted: clean.replace(/(.{4})/g, '$1 ').trim() };
}

// Oesterreichische Zaehlpunktnummer mit EAN-13 Pruefziffer
// Format: AT + 31-33 Ziffern. Letzte Ziffer ist EAN-13 Pruefziffer
// AT003000NNNNNNNNNNNAAAAAAAAAAAAAACC (33 Ziffern)
function validateZaehlpunkt(zp) {
    if (!zp) return { valid: false, error: 'Zaehlpunktnummer ist erforderlich' };
    const clean = zp.replace(/\s/g, '').toUpperCase();

    if (!/^AT\d{31,33}$/.test(clean)) {
        return { valid: false, error: 'Format: AT + 31-33 Ziffern (steht auf der Stromrechnung)' };
    }

    // EAN-13 Pruefziffer (nur bei 33 Ziffern - das ist Standard)
    if (clean.length === 35) { // AT + 33 Ziffern
        const digits = clean.slice(2);
        const checkDigit = parseInt(digits[digits.length - 1]);
        const body = digits.slice(0, -1);

        // Standard EAN-13 (letzte 13 Ziffern fuer Pruefung)
        const last13 = body.slice(-12);
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(last13[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const expected = (10 - (sum % 10)) % 10;

        if (expected !== checkDigit) {
            // Manche aelteren ZP haben keine korrekte Pruefziffer - Warnung statt Fehler
            return { valid: true, formatted: formatZp(clean), clean, warning: 'Pruefziffer weicht ab - bitte ueberpruefen' };
        }
    }

    return { valid: true, formatted: formatZp(clean), clean };
}

function formatZp(clean) {
    if (clean.length >= 35) {
        return `${clean.slice(0,2)} ${clean.slice(2,8)} ${clean.slice(8,19)} ${clean.slice(19,33)} ${clean.slice(33)}`;
    }
    return `${clean.slice(0,2)} ${clean.slice(2,8)} ${clean.slice(8)}`;
}

// Netzbetreiber-Code aus Zaehlpunktnummer extrahieren (Stellen 3-8)
function extractNetzbetreiberCode(zp) {
    if (!zp) return null;
    const clean = zp.replace(/\s/g, '').toUpperCase();
    if (!/^AT\d+/.test(clean)) return null;
    return clean.slice(2, 8); // 6-stelliger Netzbetreiber-Code
}

// UID-Nummer (ATU + 8 Ziffern) mit Pruefziffer-Algorithmus
function validateUID(uid) {
    if (!uid) return { valid: false, error: 'UID-Nummer ist erforderlich' };
    const clean = uid.replace(/\s/g, '').toUpperCase();

    if (!/^ATU\d{8}$/.test(clean)) {
        return { valid: false, error: 'UID-Nummer muss Format ATU + 8 Ziffern haben (z.B. ATU12345678)' };
    }

    // Oesterreichischer UID-Pruefziffer-Algorithmus
    // Stellen 1-7 (nach ATU) werden gewichtet, Stelle 8 ist Pruefziffer
    const digits = clean.slice(3).split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 7; i++) {
        const weight = i % 2 === 0 ? 1 : 2;
        const product = digits[i] * weight;
        sum += Math.floor(product / 10) + (product % 10);
    }
    const checkDigit = (10 - ((sum + 4) % 10)) % 10;

    if (checkDigit !== digits[7]) {
        return { valid: false, error: 'UID-Pruefziffer ungueltig - bitte UID-Nummer ueberpruefen' };
    }

    return { valid: true, formatted: clean };
}

// PLZ (4 Ziffern, oesterreichisch)
function validatePLZ(plz) {
    if (!plz) return { valid: false, error: 'PLZ ist erforderlich' };
    const clean = plz.toString().trim();

    if (!/^\d{4}$/.test(clean)) {
        return { valid: false, error: 'PLZ muss 4 Ziffern haben' };
    }

    const num = parseInt(clean);
    if (num < 1010 || num > 9992) {
        return { valid: false, error: 'Ungueltige oesterreichische PLZ' };
    }

    return { valid: true };
}

// Telefonnummer (permissiv, oesterreichisch)
function validateTelefon(tel) {
    if (!tel) return { valid: true }; // Optional
    const clean = tel.replace(/[\s\-\/\(\)]/g, '');

    if (!/^\+?[\d]{7,15}$/.test(clean)) {
        return { valid: false, error: 'Ungueltige Telefonnummer' };
    }

    return { valid: true };
}

// Geburtsdatum (muss in der Vergangenheit liegen, Person muss mindestens 18 sein)
function validateGeburtsdatum(datum) {
    if (!datum) return { valid: false, error: 'Geburtsdatum ist erforderlich' };
    const d = new Date(datum);
    if (isNaN(d.getTime())) return { valid: false, error: 'Ungueltiges Datum' };

    const heute = new Date();
    const alter = (heute - d) / (365.25 * 24 * 60 * 60 * 1000);

    if (alter < 18) return { valid: false, error: 'Mindestalter 18 Jahre' };
    if (alter > 120) return { valid: false, error: 'Ungueltiges Geburtsdatum' };

    return { valid: true };
}

// Ausweisnummer je nach Typ
// Reisepass AT: 1 Buchstabe + 7 Ziffern (z.B. P1234567)
// Personalausweis AT: 8 alphanumerische Zeichen
// Fuehrerschein AT: 8-stellige Zahl
function validateAusweisnummer(nummer, typ) {
    if (!nummer || !typ) return { valid: true }; // beides optional
    const clean = nummer.trim().toUpperCase();
    if (!clean) return { valid: true };

    switch (typ) {
        case 'Reisepass':
            if (!/^[A-Z]\d{7}$/.test(clean)) {
                return { valid: false, error: 'Reisepass-Nummer: 1 Buchstabe + 7 Ziffern (z.B. P1234567)' };
            }
            break;
        case 'Personalausweis':
            if (!/^[A-Z0-9]{8,9}$/.test(clean)) {
                return { valid: false, error: 'Personalausweis-Nummer: 8-9 alphanumerische Zeichen' };
            }
            break;
        case 'Führerschein':
        case 'Fuehrerschein':
            if (!/^\d{7,8}$/.test(clean)) {
                return { valid: false, error: 'Führerschein-Nummer: 7-8 stellige Zahl' };
            }
            break;
        default:
            if (clean.length < 4) {
                return { valid: false, error: 'Ausweisnummer zu kurz (mind. 4 Zeichen)' };
            }
    }
    return { valid: true };
}

// Inventarnummer (Format: XXX.XXX.XXX, permissiv)
function validateInventarnummer(inv) {
    if (!inv) return { valid: true }; // Optional
    if (inv.trim().length < 3) {
        return { valid: false, error: 'Inventarnummer zu kurz' };
    }
    return { valid: true };
}

// Firmenbuchnummer
function validateFirmenbuchnummer(fb) {
    if (!fb) return { valid: false, error: 'Firmenbuchnummer ist erforderlich' };
    const clean = fb.trim().toUpperCase();

    if (!/^(FN\s?)?\d{1,6}\s?[A-Z]$/i.test(clean)) {
        return { valid: false, error: 'Ungueltige Firmenbuchnummer (z.B. FN 123456a)' };
    }

    return { valid: true };
}

// IBAN -> Bankidentifier extrahieren (5 Stellen Bankleitzahl)
function extractAtBlz(iban) {
    if (!iban) return null;
    const clean = iban.replace(/\s/g, '').toUpperCase();
    if (!/^AT\d{18}$/.test(clean)) return null;
    return clean.slice(4, 9); // 5-stellige BLZ
}

// Schritt-Validierung (validiert alle Felder eines Onboarding-Schritts)
function validateStep(step, data, memberType) {
    const errors = {};

    switch (step) {
        case 'personal': {
            if (!data.vorname?.trim()) errors.vorname = 'Vorname ist erforderlich';
            if (!data.nachname?.trim()) errors.nachname = 'Nachname ist erforderlich';
            if (!data.strasse?.trim()) errors.strasse = 'Strasse ist erforderlich';
            if (!data.hausnummer?.trim()) errors.hausnummer = 'Hausnummer ist erforderlich';

            const plzResult = validatePLZ(data.plz);
            if (!plzResult.valid) errors.plz = plzResult.error;

            if (!data.ort?.trim()) errors.ort = 'Ort ist erforderlich';

            const emailResult = validateEmail(data.email);
            if (!emailResult.valid) errors.email = emailResult.error;

            if (data.telefon) {
                const telResult = validateTelefon(data.telefon);
                if (!telResult.valid) errors.telefon = telResult.error;
            }

            if (memberType === 'privatperson' || memberType === 'landwirtschaft') {
                const gebResult = validateGeburtsdatum(data.geburtsdatum);
                if (!gebResult.valid) errors.geburtsdatum = gebResult.error;
            }

            if (memberType === 'unternehmen') {
                if (!data.firmenname?.trim()) errors.firmenname = 'Firmenname ist erforderlich';
                const uidResult = validateUID(data.uid_nummer);
                if (!uidResult.valid) errors.uid_nummer = uidResult.error;
            }

            if (data.ausweisnummer?.trim() || data.ausweis_typ) {
                const ausweisResult = validateAusweisnummer(data.ausweisnummer, data.ausweis_typ);
                if (!ausweisResult.valid) errors.ausweisnummer = ausweisResult.error;
            }

            break;
        }

        case 'zahlung': {
            if (!data.kontoinhaber?.trim()) errors.kontoinhaber = 'Name KontoinhaberIn ist erforderlich';

            const ibanResult = validateIBAN(data.iban);
            if (!ibanResult.valid) errors.iban = ibanResult.error;

            if (!data.bankname?.trim()) errors.bankname = 'Name der Bank ist erforderlich';
            if (!data.sepa_akzeptiert) errors.sepa_akzeptiert = 'SEPA-Lastschriftmandat muss akzeptiert werden';

            break;
        }

        case 'bestaetigung': {
            if (!data.statuten_akzeptiert) errors.statuten = 'Statuten muessen akzeptiert werden';
            if (!data.agb_akzeptiert) errors.agb = 'AGB muessen akzeptiert werden';
            if (!data.datenschutz_akzeptiert) errors.datenschutz = 'Datenschutzerklaerung muss akzeptiert werden';
            if (!data.netzbetreiber_vollmacht) errors.vollmacht = 'Netzbetreibervollmacht muss erteilt werden';
            break;
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors
    };
}

module.exports = {
    validateEmail,
    validateIBAN,
    validateZaehlpunkt,
    validateUID,
    validatePLZ,
    validateTelefon,
    validateGeburtsdatum,
    validateInventarnummer,
    validateFirmenbuchnummer,
    validateAusweisnummer,
    validateStep,
    extractNetzbetreiberCode,
    extractAtBlz,
    formatZp
};
