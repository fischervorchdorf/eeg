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
        if (!/^AT\d{18}$/.test(clean)) return { valid: false, error: 'IBAN: AT + 18 Ziffern' };

        // MOD-97
        const rearranged = clean.slice(4) + clean.slice(0, 4);
        const numeric = rearranged.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());
        let rem = '';
        for (const d of numeric) { rem += d; rem = (parseInt(rem) % 97).toString(); }
        if (parseInt(rem) !== 1) return { valid: false, error: 'IBAN Pruefziffer ungueltig' };

        return { valid: true, formatted: clean.replace(/(.{4})/g, '$1 ').trim() };
    },

    zaehlpunkt(zp) {
        if (!zp) return { valid: false, error: 'Zaehlpunktnummer erforderlich' };
        const clean = zp.replace(/\s/g, '').toUpperCase();
        if (!/^AT\d{31,33}$/.test(clean)) return { valid: false, error: 'Format: AT + 33 Ziffern' };
        return { valid: true, clean };
    },

    plz(plz) {
        if (!plz) return { valid: false, error: 'PLZ erforderlich' };
        if (!/^\d{4}$/.test(plz.trim())) return { valid: false, error: '4 Ziffern' };
        const n = parseInt(plz);
        if (n < 1010 || n > 9992) return { valid: false, error: 'Ungueltige PLZ' };
        return { valid: true };
    },

    uid(uid) {
        if (!uid) return { valid: false, error: 'UID-Nummer erforderlich' };
        if (!/^ATU\d{8}$/i.test(uid.replace(/\s/g, ''))) return { valid: false, error: 'Format: ATU + 8 Ziffern' };
        return { valid: true };
    },

    required(val, name) {
        if (!val || !val.trim()) return { valid: false, error: `${name} ist erforderlich` };
        return { valid: true };
    },

    // Feld live validieren und visuelles Feedback geben
    validateField(input, validatorFn) {
        const result = validatorFn(input.value);
        const hint = input.parentElement.querySelector('.validation-hint');

        input.classList.toggle('input-error', !result.valid);
        input.classList.toggle('input-valid', result.valid && input.value.length > 0);

        if (hint) {
            hint.textContent = result.valid ? '' : result.error;
            hint.className = `validation-hint ${result.valid ? '' : 'error'}`;
        }

        return result;
    }
};
