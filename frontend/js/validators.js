/**
 * Client-Side Validierungen (spiegelt backend/src/utils/validators.js)
 */
const Validators = {
    email(email) {
        if (!email) return { valid: false, error: 'E-Mail ist erforderlich' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { valid: false, error: 'Ungueltige E-Mail-Adresse' };
        return { valid: true };
    },

    iban(iban) {
        if (!iban) return { valid: false, error: 'IBAN ist erforderlich' };
        const clean = iban.replace(/\s/g, '').toUpperCase();
        if (!/^AT\d{18}$/.test(clean)) return { valid: false, error: 'IBAN: AT + 18 Ziffern (20 Zeichen)' };

        // MOD-97
        const rearranged = clean.slice(4) + clean.slice(0, 4);
        const numeric = rearranged.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());
        let rem = '';
        for (const d of numeric) { rem += d; rem = (parseInt(rem) % 97).toString(); }
        if (parseInt(rem) !== 1) return { valid: false, error: 'IBAN-Prüfziffer ungültig – bitte überprüfen' };

        return { valid: true, formatted: clean.replace(/(.{4})/g, '$1 ').trim() };
    },

    zaehlpunkt(zp) {
        if (!zp) return { valid: false, error: 'Zaehlpunktnummer erforderlich' };
        const clean = zp.replace(/\s/g, '').toUpperCase();
        if (!/^AT\d{31,33}$/.test(clean)) return { valid: false, error: 'Format: AT + 31-33 Ziffern' };

        // EAN-13 Pruefziffer (bei 33 Ziffern)
        if (clean.length === 35) {
            const digits = clean.slice(2);
            const checkDigit = parseInt(digits[digits.length - 1]);
            const last12 = digits.slice(-13, -1);
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                sum += parseInt(last12[i]) * (i % 2 === 0 ? 1 : 3);
            }
            const expected = (10 - (sum % 10)) % 10;
            if (expected !== checkDigit) {
                return { valid: true, clean, warning: 'Prüfziffer weicht ab – bitte überprüfen' };
            }
        }

        return { valid: true, clean };
    },

    plz(plz) {
        if (!plz) return { valid: false, error: 'PLZ erforderlich' };
        if (!/^\d{4}$/.test(plz.toString().trim())) return { valid: false, error: '4 Ziffern' };
        const n = parseInt(plz);
        if (n < 1010 || n > 9992) return { valid: false, error: 'Ungueltige PLZ' };
        return { valid: true };
    },

    uid(uid) {
        if (!uid) return { valid: false, error: 'UID-Nummer erforderlich' };
        const clean = uid.replace(/\s/g, '').toUpperCase();
        if (!/^ATU\d{8}$/.test(clean)) return { valid: false, error: 'Format: ATU + 8 Ziffern' };

        // Pruefziffer-Algorithmus
        const digits = clean.slice(3).split('').map(Number);
        let sum = 0;
        for (let i = 0; i < 7; i++) {
            const product = digits[i] * (i % 2 === 0 ? 1 : 2);
            sum += Math.floor(product / 10) + (product % 10);
        }
        const checkDigit = (10 - ((sum + 4) % 10)) % 10;
        if (checkDigit !== digits[7]) {
            return { valid: false, error: 'UID-Prüfziffer ungültig' };
        }

        return { valid: true };
    },

    firmenbuchnummer(fb) {
        if (!fb) return { valid: false, error: 'Firmenbuchnummer erforderlich' };
        const clean = fb.trim().toUpperCase();
        if (!/^(FN\s?)?\d{1,6}\s?[A-Z]$/i.test(clean)) {
            return { valid: false, error: 'Format: FN 123456a' };
        }
        return { valid: true };
    },

    required(val, name) {
        if (!val || !val.toString().trim()) return { valid: false, error: `${name} ist erforderlich` };
        return { valid: true };
    },

    // Feld live validieren und visuelles Feedback geben
    validateField(input, validatorFn) {
        const result = validatorFn(input.value);
        const hint = input.parentElement.querySelector('.validation-hint');

        input.classList.toggle('input-error', !result.valid);
        input.classList.toggle('input-valid', result.valid && input.value.length > 0);
        input.classList.toggle('input-warning', result.valid && !!result.warning);

        if (hint) {
            if (!result.valid) {
                hint.textContent = result.error;
                hint.className = 'validation-hint error';
            } else if (result.warning) {
                hint.textContent = '⚠ ' + result.warning;
                hint.className = 'validation-hint warning';
            } else if (input.value.length > 0) {
                hint.textContent = '✓ OK';
                hint.className = 'validation-hint success';
            } else {
                hint.textContent = '';
                hint.className = 'validation-hint';
            }
        }

        return result;
    }
};
