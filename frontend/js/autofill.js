/**
 * Autofill-Helpers fuer das Onboarding
 * - PLZ -> Ort (mit Vorschlagsliste)
 * - IBAN -> Bankname
 * - Zaehlpunkt -> Netzbetreiber
 * - Stromrechnung-OCR Upload
 */
const Autofill = {

    // Debounce helper
    _debounce(fn, ms) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    },

    // PLZ → Ort (auto-fill nach blur)
    setupPlzAutofill(plzId, ortId) {
        const plzEl = document.getElementById(plzId);
        const ortEl = document.getElementById(ortId);
        if (!plzEl || !ortEl) return;

        const lookup = async () => {
            const plz = plzEl.value.trim();
            if (!/^\d{4}$/.test(plz)) return;
            try {
                const res = await fetch(`/api/autofill/plz/${plz}`);
                const data = await res.json();
                if (data.orte && data.orte.length > 0) {
                    // Datalist mit allen Vorschlaegen (fuer Dropdown)
                    let dl = document.getElementById(plzId + '-orte');
                    if (!dl) {
                        dl = document.createElement('datalist');
                        dl.id = plzId + '-orte';
                        document.body.appendChild(dl);
                        ortEl.setAttribute('list', dl.id);
                    }
                    dl.innerHTML = data.orte.map(o => `<option value="${o.name}">`).join('');

                    // Nur auto-fuellen wenn GENAU EIN Ort zurueckkommt
                    if (data.orte.length === 1 && !ortEl.value.trim()) {
                        ortEl.value = data.orte[0].name;
                        ortEl.classList.add('input-autofilled');
                        setTimeout(() => ortEl.classList.remove('input-autofilled'), 1500);
                    } else if (data.orte.length > 1 && !ortEl.value.trim()) {
                        // Bei mehreren: Hinweis anzeigen, kein Auto-Fill
                        let hint = ortEl.parentElement.querySelector('.autofill-hint');
                        if (!hint) {
                            hint = document.createElement('small');
                            hint.className = 'autofill-hint';
                            ortEl.parentElement.appendChild(hint);
                        }
                        hint.textContent = `💡 ${data.orte.length} Orte zu dieser PLZ - bitte auswaehlen`;
                        ortEl.focus();
                        setTimeout(() => { if (hint) hint.textContent = ''; }, 5000);
                    }
                }
            } catch (e) {
                console.warn('PLZ-Lookup fehlgeschlagen', e);
            }
        };

        plzEl.addEventListener('blur', lookup);
        plzEl.addEventListener('input', this._debounce(() => {
            if (/^\d{4}$/.test(plzEl.value.trim())) lookup();
        }, 400));
    },

    // IBAN → Bankname
    setupIbanBankAutofill(ibanId, banknameId) {
        const ibanEl = document.getElementById(ibanId);
        const bankEl = document.getElementById(banknameId);
        if (!ibanEl || !bankEl) return;

        const lookup = async () => {
            const clean = ibanEl.value.replace(/\s/g, '').toUpperCase();
            if (!/^AT\d{18}$/.test(clean)) return;
            try {
                const res = await fetch(`/api/autofill/bank/${clean}`);
                const data = await res.json();
                if (data.found && !bankEl.value.trim()) {
                    bankEl.value = data.name;
                    bankEl.classList.add('input-autofilled');
                    setTimeout(() => bankEl.classList.remove('input-autofilled'), 1500);
                }
            } catch (e) {
                console.warn('Bank-Lookup fehlgeschlagen', e);
            }
        };

        ibanEl.addEventListener('blur', lookup);
    },

    // Netzbetreiber-Detection aus Zaehlpunktnummer
    async detectNetzbetreiber(zp) {
        const clean = zp.replace(/\s/g, '');
        if (!/^AT\d+/.test(clean)) return null;
        try {
            const res = await fetch(`/api/autofill/netzbetreiber/${clean}`);
            const data = await res.json();
            return data.found ? data : null;
        } catch (e) {
            return null;
        }
    },

    // Auf alle ZP-Felder im Container hooken
    setupZaehlpunktNetzbetreiber(container) {
        container.querySelectorAll('.zp-nummer').forEach(input => {
            if (input.dataset.nbHooked) return;
            input.dataset.nbHooked = '1';
            input.addEventListener('blur', async () => {
                if (input.value.trim().length < 10) return;
                const nb = await this.detectNetzbetreiber(input.value);
                let info = input.parentElement.querySelector('.nb-info');
                if (!info) {
                    info = document.createElement('div');
                    info.className = 'nb-info';
                    input.parentElement.appendChild(info);
                }
                if (nb) {
                    info.innerHTML = `<span class="nb-badge">📡 ${nb.name}${nb.region ? ' · ' + nb.region : ''}</span>`;
                } else {
                    info.innerHTML = '<span class="nb-badge nb-unknown">Netzbetreiber nicht erkannt</span>';
                }
            });
        });
    },

    // Stromrechnung-OCR Upload
    async ocrStromrechnung(file) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/ocr/stromrechnung', {
            method: 'POST',
            body: fd
        });
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('[OCR] Keine JSON-Antwort:', text.slice(0, 200));
            return { error: 'Server-Fehler (Status ' + res.status + ') – bitte nochmal versuchen' };
        }
    },

    // Setup OCR-Upload-Button
    setupOcrUpload(buttonId, fileInputId, onExtracted) {
        const btn = document.getElementById(buttonId);
        const fileInput = document.getElementById(fileInputId);
        if (!btn || !fileInput) return;

        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const orig = btn.innerHTML;
            btn.innerHTML = '⏳ Erkenne Felder...';
            btn.disabled = true;

            try {
                const result = await this.ocrStromrechnung(file);
                if (result.success && result.extracted) {
                    onExtracted(result.extracted);
                } else {
                    alert(result.error || 'OCR fehlgeschlagen');
                }
            } catch (err) {
                alert('OCR-Fehler: ' + err.message);
            } finally {
                btn.innerHTML = orig;
                btn.disabled = false;
                fileInput.value = '';
            }
        });
    },

    // Felder aus OCR-Ergebnis in das Formular schreiben
    fillFromOcr(extracted) {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el && val && !el.value) {
                el.value = val;
                el.classList.add('input-autofilled');
                setTimeout(() => el.classList.remove('input-autofilled'), 2000);
            }
        };

        if (extracted.adresse) {
            set('strasse', extracted.adresse.strasse);
            set('hausnummer', extracted.adresse.hausnummer);
            set('plz', extracted.adresse.plz);
            set('ort', extracted.adresse.ort);
        }
        if (extracted.kunde) {
            set('vorname', extracted.kunde.vorname);
            set('nachname', extracted.kunde.nachname);
            set('firmenname', extracted.kunde.firmenname);
        }

        // Zaehlpunktnummer in den ersten leeren Zaehlpunkt eintragen
        if (extracted.zaehlpunktnummer) {
            const zpInputs = document.querySelectorAll('#bezugZaehlpunkte .zp-nummer');
            for (const inp of zpInputs) {
                if (!inp.value.trim()) {
                    inp.value = extracted.zaehlpunktnummer;
                    inp.classList.add('input-autofilled');
                    inp.dispatchEvent(new Event('blur'));
                    setTimeout(() => inp.classList.remove('input-autofilled'), 2000);
                    break;
                }
            }
        }

        if (extracted.kundennummer) set('kundennummer_netzbetreiber', extracted.kundennummer);
        if (extracted.inventarnummer) set('inventarnummer_zaehler', extracted.inventarnummer);
    }
};

/**
 * Help-Modal-System
 * Verwendung: <button class="help-btn" data-help="zaehlpunkt">?</button>
 */
const HelpSystem = {
    topics: {
        zaehlpunkt: {
            title: 'Wo finde ich meine Zaehlpunktnummer?',
            content: `
                <p>Die Zaehlpunktnummer ist eine <strong>33-stellige Nummer</strong>, die mit <code>AT</code> beginnt.</p>
                <p><strong>Wo zu finden:</strong></p>
                <ul>
                    <li><strong>Stromrechnung</strong> deines Lieferanten (Energie AG, Wien Energie, EVN, ...) im Bereich "Zaehlpunkt" oder "Zaehlpunktbezeichnung"</li>
                    <li><strong>Online-Portal</strong> deines Netzbetreibers</li>
                    <li><strong>Vertrag</strong> mit deinem Stromlieferanten</li>
                </ul>
                <p><strong>Beispiel:</strong> <code>AT 003000 12345678901 23456789012345 67</code></p>
                <p>💡 <strong>Tipp:</strong> Lade einfach deine Stromrechnung als Foto/PDF hoch - wir erkennen die Nummer automatisch!</p>
            `
        },
        uid: {
            title: 'Was ist eine UID-Nummer?',
            content: `
                <p>Die <strong>UID-Nummer</strong> (Umsatzsteuer-Identifikationsnummer) wird in Oesterreich vom Finanzamt vergeben und hat das Format <code>ATU + 8 Ziffern</code>.</p>
                <p><strong>Wo zu finden:</strong></p>
                <ul>
                    <li>Auf jeder offiziellen <strong>Rechnung</strong> deines Unternehmens</li>
                    <li>Im <strong>FinanzOnline</strong> unter "Stammdaten"</li>
                    <li>Auf deinem <strong>UID-Bescheid</strong> vom Finanzamt</li>
                </ul>
                <p><strong>Beispiel:</strong> <code>ATU12345678</code></p>
                <p>Falls du keine UID-Nummer hast (z.B. als Kleinunternehmer), wende dich an dein Finanzamt.</p>
            `
        },
        firmenbuchnummer: {
            title: 'Firmenbuchnummer finden',
            content: `
                <p>Die <strong>Firmenbuchnummer</strong> wird vom Firmenbuchgericht vergeben und hat das Format <code>FN + Ziffern + Buchstabe</code>.</p>
                <p><strong>Wo zu finden:</strong></p>
                <ul>
                    <li>Im <strong>Firmenbuchauszug</strong> (online unter <a href="https://www.firmenbuchgrundbuch.at" target="_blank" rel="noopener">firmenbuchgrundbuch.at</a>)</li>
                    <li>Auf <strong>Geschaeftspapier</strong> deines Unternehmens</li>
                    <li>Im <strong>Impressum</strong> deiner Webseite</li>
                </ul>
                <p><strong>Beispiel:</strong> <code>FN 123456a</code></p>
            `
        },
        inventarnummer: {
            title: 'Inventarnummer des Zaehlers',
            content: `
                <p>Die <strong>Inventarnummer</strong> (auch Zaehler- oder Geraetenummer) steht direkt am Stromzaehler.</p>
                <p><strong>Wo zu finden:</strong></p>
                <ul>
                    <li>Direkt am <strong>Stromzaehler</strong> aufgedruckt oder auf einem Aufkleber</li>
                    <li>Auf der <strong>Stromrechnung</strong> oft unter "Geraetenummer" oder "Zaehler-Nr."</li>
                </ul>
                <p><strong>Format:</strong> Meistens 6-9 stellige Zahl, z.B. <code>123.456.789</code></p>
                <p>💡 Bei modernen Smart Metern findet sich die Nummer auf dem Display oder seitlich am Geraet.</p>
            `
        },
        iban: {
            title: 'IBAN finden',
            content: `
                <p>Die <strong>IBAN</strong> ist deine internationale Kontonummer und beginnt in Oesterreich mit <code>AT</code> + 18 Ziffern.</p>
                <p><strong>Wo zu finden:</strong></p>
                <ul>
                    <li>Auf deiner <strong>Bankkarte</strong> (Vorder- oder Rueckseite)</li>
                    <li>Im <strong>Online-Banking</strong> unter Konto-Details</li>
                    <li>Auf einem <strong>Kontoauszug</strong></li>
                </ul>
                <p><strong>Beispiel:</strong> <code>AT12 3456 7890 1234 5678</code></p>
            `
        },
        kundennummer_netzbetreiber: {
            title: 'Kundennummer beim Netzbetreiber',
            content: `
                <p>Die <strong>Kundennummer</strong> identifiziert dich bei deinem Netzbetreiber (z.B. Netz OOe, Wiener Netze).</p>
                <p><strong>Wo zu finden:</strong></p>
                <ul>
                    <li>Auf der <strong>Netzentgelt-Rechnung</strong> (oft separat von der Stromrechnung)</li>
                    <li>Im <strong>Kundenportal</strong> deines Netzbetreibers</li>
                    <li>Auf <strong>Briefen</strong> des Netzbetreibers</li>
                </ul>
                <p>💡 Diese ist nicht identisch mit der Kundennummer deines Stromlieferanten!</p>
            `
        }
    },

    init() {
        // Modal-Container ins DOM einfuegen falls noch nicht da
        if (document.getElementById('helpModal')) return;

        const modal = document.createElement('div');
        modal.id = 'helpModal';
        modal.className = 'help-modal';
        modal.innerHTML = `
            <div class="help-modal-backdrop"></div>
            <div class="help-modal-content">
                <button class="help-modal-close" aria-label="Schliessen">&times;</button>
                <h3 class="help-modal-title"></h3>
                <div class="help-modal-body"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.help-modal-backdrop').addEventListener('click', () => this.close());
        modal.querySelector('.help-modal-close').addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });

        // Delegierte Click-Listener fuer Help-Buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.help-btn');
            if (btn) {
                e.preventDefault();
                this.show(btn.dataset.help);
            }
        });
    },

    show(topic) {
        const data = this.topics[topic];
        if (!data) return;
        const modal = document.getElementById('helpModal');
        modal.querySelector('.help-modal-title').textContent = data.title;
        modal.querySelector('.help-modal-body').innerHTML = data.content;
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    },

    close() {
        const modal = document.getElementById('helpModal');
        if (modal) modal.classList.remove('open');
        document.body.style.overflow = '';
    }
};
