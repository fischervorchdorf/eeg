/**
 * EEG Onboarding Wizard Controller
 */
(function() {
    let currentStep = 1;
    const totalSteps = 10;
    let eegConfig = null;
    let memberTypes = [];
    let selectedType = null;

    const progressMap = { 1: 0, 2: 0, 3: 13, 4: 25, 5: 38, 6: 50, 7: 63, 8: 75, 9: 88, 10: 100 };

    // --- INIT ---
    async function init() {
        // EEG-Config laden
        const urlParams = new URLSearchParams(window.location.search);
        let eegSlug = urlParams.get('eeg');
        if (!eegSlug) {
            const parts = window.location.hostname.split('.');
            if (parts.length >= 3 && parts[0] !== 'www') eegSlug = parts[0];
        }

        if (eegSlug) {
            try {
                eegConfig = await OnboardingAPI.loadEeg(eegSlug);
                if (eegConfig && !eegConfig.error) {
                    localStorage.setItem('eeg_config', JSON.stringify(eegConfig));
                    applyBranding(eegConfig);
                }
            } catch (e) { console.error('EEG laden fehlgeschlagen:', e); }
        }

        // Fallback: Wenn keine EEG via URL gefunden, Default-Tenant laden
        if (!eegConfig || eegConfig.error || !eegConfig.id) {
            try {
                const defaultEeg = await OnboardingAPI.loadDefaultEeg();
                if (defaultEeg && defaultEeg.id) {
                    eegConfig = defaultEeg;
                    localStorage.setItem('eeg_config', JSON.stringify(eegConfig));
                    applyBranding(eegConfig);
                }
            } catch (e) { console.error('Default-EEG laden fehlgeschlagen:', e); }
        }

        // Member-Types laden
        try {
            memberTypes = await OnboardingAPI.loadMemberTypes();
            renderTypeCards();
        } catch (e) { console.error('Member-Types laden fehlgeschlagen:', e); }

        // Events
        document.getElementById('btnNext').addEventListener('click', nextStep);
        document.getElementById('btnBack').addEventListener('click', prevStep);
        document.getElementById('addBezugZp').addEventListener('click', () => addZählpunkt('bezug'));
        document.getElementById('addEinspeisungZp').addEventListener('click', () => addZählpunkt('einspeisung'));
        document.getElementById('addSpeicher').addEventListener('click', addSpeicher);

        // Live-Validierung + Autofill + Help-System
        setupLiveValidation();
        setupAutofill();
        HelpSystem.init();
        setupOcrUpload();
        setupEmailVerification();
        setupPdfPreview();

        // File Uploads
        initFileUploads();

        // Stale-Session-Check
        if (OnboardingAPI.restoreSession()) {
            const stillValid = await OnboardingAPI.checkSession(OnboardingAPI.applicationId, OnboardingAPI.passphrase);
            if (!stillValid) {
                console.warn('Stale session - cleared');
                OnboardingAPI.clearSession();
            }
        }

        showStep(1);
    }

    function setupAutofill() {
        // PLZ → Ort
        Autofill.setupPlzAutofill('plz', 'ort');
        // IBAN → Bank
        Autofill.setupIbanBankAutofill('iban', 'bankname');
    }

    function setupOcrUpload() {
        const btn = document.getElementById('btnOcrUpload');
        const fileInput = document.getElementById('ocrFile');
        if (!btn || !fileInput) return;
        Autofill.setupOcrUpload('btnOcrUpload', 'ocrFile', (extracted) => {
            Autofill.fillFromOcr(extracted);
            const msg = document.getElementById('ocrResult');
            if (msg) {
                msg.textContent = '✓ Felder wurden ausgefüllt – bitte überprüfen';
                msg.className = 'ocr-result success';
                setTimeout(() => { msg.textContent = ''; msg.className = 'ocr-result'; }, 4000);
            }
        });
    }

    function setupPdfPreview() {
        const btn = document.getElementById('btnPreviewPdf');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!OnboardingAPI.applicationId) { alert('Kein aktiver Antrag'); return; }
            window.open(OnboardingAPI.previewPdfUrl(), '_blank');
        });
    }

    function setupEmailVerification() {
        const sendBtn = document.getElementById('btnSendVerification');
        const checkBtn = document.getElementById('btnCheckVerification');
        if (sendBtn) {
            sendBtn.addEventListener('click', async () => {
                const email = val('email');
                const validation = Validators.email(email);
                if (!validation.valid) { alert(validation.error); return; }
                if (!OnboardingAPI.applicationId) { alert('Bitte erst Mitgliedstyp waehlen'); return; }

                sendBtn.disabled = true;
                sendBtn.textContent = 'Sende...';
                const result = await OnboardingAPI.sendVerificationCode(email);
                sendBtn.disabled = false;
                sendBtn.textContent = 'Code erneut senden';

                if (result.success) {
                    document.getElementById('verifyCodeBox').style.display = 'block';
                    const msg = document.getElementById('verifyMsg');
                    if (result.dev_code) {
                        msg.innerHTML = `✓ Code gesendet an ${email}<br><strong style="font-size:1.2em; background:rgba(78,163,114,0.2); padding:4px 10px; border-radius:4px; letter-spacing:2px;">DEV-MODUS: ${result.dev_code}</strong><br><small>Kein SMTP konfiguriert - der Code wird nur hier angezeigt und im Server-Terminal.</small>`;
                        // Code direkt einfüllen damit der User nur noch "Code prüfen" klicken muss
                        document.getElementById('verifyCode').value = result.dev_code;
                    } else {
                        msg.textContent = '✓ Code gesendet – bitte Posteingang prüfen (auch Spam-Ordner)';
                    }
                    msg.className = 'verify-msg success';
                } else {
                    alert(result.error || 'Senden fehlgeschlagen');
                }
            });
        }
        if (checkBtn) {
            checkBtn.addEventListener('click', async () => {
                const code = val('verifyCode');
                if (!/^\d{6}$/.test(code)) { alert('Bitte 6-stelligen Code eingeben'); return; }

                checkBtn.disabled = true;
                const result = await OnboardingAPI.checkVerificationCode(code, val('email'));
                checkBtn.disabled = false;

                const msg = document.getElementById('verifyMsg');
                if (result.success) {
                    msg.textContent = '✓ E-Mail bestätigt!';
                    msg.className = 'verify-msg success';
                    document.getElementById('emailVerifiedFlag').value = '1';
                    document.getElementById('email').setAttribute('readonly', 'readonly');
                    document.getElementById('email').classList.add('input-verified');
                    checkBtn.style.display = 'none';
                    document.getElementById('btnSendVerification').style.display = 'none';
                } else {
                    msg.textContent = result.error || 'Code falsch';
                    msg.className = 'verify-msg error';
                }
            });
        }
    }

    function applyBranding(eeg) {
        if (!eeg) return;
        document.getElementById('eegName').textContent = eeg.name || 'Energiegemeinschaft';
        document.title = `${eeg.name} - Beitritt`;

        if (eeg.logo_url) {
            const logo = document.getElementById('eegLogo');
            logo.src = eeg.logo_url;
            logo.alt = eeg.name;
            logo.style.display = 'block';
        }
        if (eeg.farbe_primary) document.documentElement.style.setProperty('--primary', eeg.farbe_primary);
        if (eeg.farbe_secondary) document.documentElement.style.setProperty('--secondary', eeg.farbe_secondary);
        if (eeg.background_url) document.body.style.backgroundImage = `url(${eeg.background_url})`;
        if (eeg.creditor_id) {
            const el = document.getElementById('creditorId');
            if (el) el.textContent = eeg.creditor_id;
        }
        // Impressum befüllen
        const imp2 = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
        imp2('impName2', eeg.name);
        imp2('impSitz2', eeg.sitz);
        imp2('impZvr2', eeg.zvr_nummer ? 'ZVR ' + eeg.zvr_nummer : '-');
        imp2('impKontakt2', eeg.kontakt_email);

        // Dokument-Links
        if (eeg.statuten_url) { const l = document.getElementById('statutenLink'); if (l) l.href = eeg.statuten_url; }
        if (eeg.agb_url) { const l = document.getElementById('agbLink'); if (l) l.href = eeg.agb_url; }
        if (eeg.datenschutz_url) { const l = document.getElementById('datenschutzLink'); if (l) l.href = eeg.datenschutz_url; }
    }

    // --- TYPE CARDS ---
    function renderTypeCards() {
        const container = document.getElementById('typeCards');
        const icons = {
            unternehmen: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></svg>',
            privatperson: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
            landwirtschaft: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
        };

        container.innerHTML = memberTypes.map(t => `
            <button class="type-card" data-type-id="${t.id}" data-key="${t.key_name}">
                <div class="type-card-icon">${icons[t.key_name] || icons.privatperson}</div>
                <span>Als ${t.label_de} beitreten</span>
            </button>
        `).join('');

        // Info-Bereich
        const infoContainer = document.getElementById('typeInfo');
        infoContainer.innerHTML = `
            <div class="type-info-box">
                <h3>Übersicht Beitrittsoptionen</h3>
                ${memberTypes.map(t => `
                    <div class="type-info-item">
                        <strong>Als ${t.label_de} beitreten</strong>
                        <p>${t.beschreibung || ''}</p>
                    </div>
                `).join('')}
            </div>
        `;

        container.querySelectorAll('.type-card').forEach(card => {
            card.addEventListener('click', async () => {
                container.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedType = {
                    id: parseInt(card.dataset.typeId),
                    key: card.dataset.key
                };

                // Firmen-Felder anzeigen/verstecken
                const companyFields = document.getElementById('companyFields');
                if (companyFields) {
                    companyFields.style.display = selectedType.key === 'unternehmen' ? 'block' : 'none';
                }

                // Auto-Advance: Antrag starten und direkt weiter zur Info-Seite
                if (eegConfig?.id && !OnboardingAPI.applicationId) {
                    const result = await OnboardingAPI.start(eegConfig.id, selectedType.id);
                    if (result.success) {
                        showStep(2);
                    }
                } else if (OnboardingAPI.applicationId) {
                    showStep(2);
                }
            });
        });
    }

    // --- STEP NAVIGATION ---
    function showStep(step) {
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        const stepEl = document.querySelector(`.wizard-step[data-step="${step}"]`);
        if (stepEl) stepEl.classList.add('active');

        currentStep = step;

        // Nav aktualisieren
        const btnBack = document.getElementById('btnBack');
        const btnNext = document.getElementById('btnNext');

        btnBack.style.display = step > 1 ? 'flex' : 'none';

        // onclick nie setzen - addEventListener haelt nextStep gebunden
        btnNext.onclick = null;

        if (step === totalSteps) {
            btnNext.textContent = '← Zur Hauptseite';
        } else if (step === 9) {
            btnNext.textContent = '✓ Antrag einreichen';
        } else if (step === 1 && !selectedType) {
            btnNext.textContent = 'Los geht\'s!';
        } else {
            btnNext.textContent = 'Weiter';
        }

        // Schritt-Zähler
        const stepCounterEl = document.getElementById('stepCounter');
        if (stepCounterEl) {
            if (step < totalSteps) {
                stepCounterEl.textContent = `Schritt ${step} von ${totalSteps - 1}`;
            } else {
                stepCounterEl.textContent = '';
            }
        }

        // Progress
        const pct = progressMap[step] || 0;
        document.getElementById('progressFill').style.width = pct + '%';
        document.getElementById('progressText').textContent = pct + '%';

        // Spezial: Step 5 dynamisch aufbauen
        if (step === 5) buildZpDetails();

        window.scrollTo(0, 0);
    }

    async function nextStep() {
        const btnNext = document.getElementById('btnNext');
        if (btnNext.disabled) return;
        btnNext.disabled = true;

        // Step 10 = Abschluss - zurueck zur Startseite
        if (currentStep === totalSteps) {
            OnboardingAPI.clearSession();
            window.location.href = '/';
            return;
        }

        try {
            // Step-spezifische Logik
            switch (currentStep) {
                case 1: { // Typ wählen + Antrag starten
                    if (!selectedType) { alert('Bitte wähle eine Beitrittsform'); btnNext.disabled = false; return; }
                    if (!eegConfig?.id) { alert('Keine EEG konfiguriert'); btnNext.disabled = false; return; }

                    if (!OnboardingAPI.applicationId) {
                        const result = await OnboardingAPI.start(eegConfig.id, selectedType.id);
                        if (!result.success) { alert(result.error || 'Fehler'); btnNext.disabled = false; return; }
                    }
                    break;
                }
                case 2: break; // Info-Seite, keine Aktion

                case 3: { // Persoenliche Daten speichern
                    const data = collectPersonalData();
                    if (!data) { btnNext.disabled = false; return; }
                    const result = await OnboardingAPI.saveStep('personal', data);
                    if (result.errors) { showErrors(result.errors); btnNext.disabled = false; return; }
                    if (result.error) { if (await safeError(result)) return; alert(result.error); btnNext.disabled = false; return; }
                    break;
                }
                case 4: { // Zahlpunkte speichern
                    const data = collectZaehlpunkte();
                    if (!data) { btnNext.disabled = false; return; }
                    const result = await OnboardingAPI.saveStep('zaehlpunkte', data);
                    if (result.error) { if (await safeError(result)) return; alert(result.error); btnNext.disabled = false; return; }
                    break;
                }
                case 5: { // Ergaenzende Angaben
                    const data = collectZpDetails();
                    const result = await OnboardingAPI.saveStep('ergaenzend', data);
                    if (result.error) { if (await safeError(result)) return; alert(result.error); btnNext.disabled = false; return; }
                    break;
                }
                case 6: break; // Dokumente - werden inline hochgeladen

                case 7: { // Zahlung
                    const data = collectPaymentData();
                    if (!data) { btnNext.disabled = false; return; }
                    const result = await OnboardingAPI.saveStep('zahlung', data);
                    if (result.errors) { showErrors(result.errors); btnNext.disabled = false; return; }
                    if (result.error) { if (await safeError(result)) return; alert(result.error); btnNext.disabled = false; return; }
                    break;
                }
                case 8: { // Bestätigungen
                    const data = collectConfirmations();
                    if (!data) { btnNext.disabled = false; return; }
                    const result = await OnboardingAPI.saveStep('bestaetigung', data);
                    if (result.errors) { showErrors(result.errors); btnNext.disabled = false; return; }
                    break;
                }
                case 9: { // Freiwillig + Submit
                    const volData = collectVoluntaryData();
                    await OnboardingAPI.saveStep('freiwillig', volData);

                    const submitResult = await OnboardingAPI.submit();
                    if (submitResult.error) { alert(submitResult.error); btnNext.disabled = false; return; }

                    // Passphrase anzeigen
                    const ppBox = document.getElementById('passphraseBox');
                    const ppDisplay = document.getElementById('passphraseDisplay');
                    ppBox.style.display = 'block';
                    ppDisplay.textContent = OnboardingAPI.passphrase;
                    break;
                }
            }

            showStep(currentStep + 1);
        } catch (err) {
            console.error('Fehler:', err);
            alert('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
        }

        btnNext.disabled = false;
    }

    // Wrapper um saveStep mit Stale-Session-Handling
    async function safeError(result) {
        if (!result) return false;
        if (result.error === 'Antrag nicht gefunden') {
            alert('Deine Sitzung ist abgelaufen. Du wirst jetzt zur Startseite geleitet.');
            OnboardingAPI.clearSession();
            window.location.reload();
            return true;
        }
        return false;
    }

    function prevStep() {
        if (currentStep > 1) showStep(currentStep - 1);
    }

    // --- DATA COLLECTORS ---
    function collectPersonalData() {
        const data = {
            titel: val('titel'), vorname: val('vorname'), nachname: val('nachname'),
            postname: val('postname'), strasse: val('strasse'), hausnummer: val('hausnummer'),
            plz: val('plz'), ort: val('ort'), ausweis_typ: val('ausweis_typ'),
            ausweisnummer: val('ausweisnummer'), geburtsdatum: val('geburtsdatum'),
            telefon: val('telefon'), email: val('email')
        };

        if (selectedType?.key === 'unternehmen') {
            data.firmenname = val('firmenname');
            data.uid_nummer = val('uid_nummer');
            data.firmenbuchnummer = val('firmenbuchnummer');
        }

        // Pflichtfeld-Check
        const required = ['vorname', 'nachname', 'strasse', 'hausnummer', 'plz', 'ort', 'email'];
        if (selectedType?.key === 'unternehmen') required.push('firmenname', 'uid_nummer');

        for (const f of required) {
            if (!data[f]?.trim()) {
                highlightField(f);
                alert('Bitte alle Pflichtfelder ausfüllen');
                return null;
            }
        }

        // Ausweisnummer-Format prüfen (wenn angegeben)
        if (data.ausweisnummer?.trim()) {
            const nr = data.ausweisnummer.trim().toUpperCase();
            let formatOk = true;
            let formatHint = '';
            switch (data.ausweis_typ) {
                case 'Reisepass':
                    if (!/^[A-Z]\d{7}$/.test(nr)) {
                        formatOk = false;
                        formatHint = 'Reisepass: 1 Buchstabe + 7 Ziffern (z.B. P1234567)';
                    }
                    break;
                case 'Personalausweis':
                    if (!/^[A-Z0-9]{8,9}$/.test(nr)) {
                        formatOk = false;
                        formatHint = 'Personalausweis: 8-9 alphanumerische Zeichen';
                    }
                    break;
                case 'Führerschein':
                    if (!/^\d{7,8}$/.test(nr)) {
                        formatOk = false;
                        formatHint = 'Führerschein: 7-8 stellige Zahl';
                    }
                    break;
                default:
                    if (nr.length < 4) {
                        formatOk = false;
                        formatHint = 'Ausweisnummer mind. 4 Zeichen';
                    }
            }
            if (!formatOk) {
                highlightField('ausweisnummer');
                alert(formatHint);
                return null;
            }
        }

        return data;
    }

    function collectZaehlpunkte() {
        const bezug = [];
        document.querySelectorAll('#bezugZaehlpunkte .zp-entry').forEach(el => {
            const nr = el.querySelector('.zp-nummer')?.value?.trim();
            if (nr) bezug.push({ zaehlpunktnummer: nr });
        });

        const einspeisung = [];
        document.querySelectorAll('#einspeisungZaehlpunkte .zp-entry').forEach(el => {
            const nr = el.querySelector('.zp-nummer')?.value?.trim();
            if (nr) {
                einspeisung.push({
                    zaehlpunktnummer: nr,
                    pv_leistung_kwp: el.querySelector('.zp-pv')?.value || null,
                    rueckspeise_limitierung: el.querySelector('.zp-limit')?.value || null
                });
            }
        });

        if (bezug.length === 0) {
            alert('Mindestens ein Bezugs-Zählpunkt erforderlich');
            return null;
        }

        // Validierung
        for (const zp of [...bezug, ...einspeisung]) {
            const result = Validators.zaehlpunkt(zp.zaehlpunktnummer);
            if (!result.valid) {
                alert(`Zählpunkt "${zp.zaehlpunktnummer}": ${result.error}`);
                return null;
            }
        }

        return { bezug, einspeisung, energiespeicher: collectSpeicher() };
    }

    function collectSpeicher() {
        const items = [];
        document.querySelectorAll('#energiespeicher .speicher-entry').forEach(el => {
            let typ = el.querySelector('.speicher-typ')?.value;
            if (typ === '__sonstiges') {
                typ = el.querySelector('.speicher-sonstige')?.value || 'Sonstige';
            }
            const kap = el.querySelector('.speicher-kwh')?.value;
            if (typ || kap) items.push({ typ, kapazitaet_kwh: kap || null });
        });
        return items;
    }

    function collectZpDetails() {
        const zaehlpunkte = [];
        document.querySelectorAll('#zpDetails .zp-detail').forEach(el => {
            zaehlpunkte.push({
                id: parseInt(el.dataset.zpId),
                strasse: el.querySelector('.zp-strasse')?.value || '',
                hausnummer: el.querySelector('.zp-hausnr')?.value || '',
                plz: el.querySelector('.zp-plz')?.value || '',
                ort: el.querySelector('.zp-ort')?.value || '',
                teilnahmefaktor: el.querySelector('.zp-faktor')?.value || 100,
                jahresverbrauch_kwh: el.querySelector('.zp-verbrauch')?.value || null
            });
        });
        return { zaehlpunkte };
    }

    function collectPaymentData() {
        const data = {
            kontoinhaber: val('kontoinhaber'),
            iban: val('iban'),
            bankname: val('bankname'),
            sepa_akzeptiert: document.getElementById('sepa_akzeptiert')?.checked
        };

        if (!data.kontoinhaber?.trim()) { alert('Name KontoinhaberIn erforderlich'); return null; }
        const ibanResult = Validators.iban(data.iban);
        if (!ibanResult.valid) { alert(ibanResult.error); return null; }
        if (!data.bankname?.trim()) { alert('Bankname erforderlich'); return null; }
        if (!data.sepa_akzeptiert) { alert('SEPA-Lastschriftmandat muss akzeptiert werden'); return null; }

        return data;
    }

    function collectConfirmations() {
        const data = {
            statuten_akzeptiert: document.getElementById('statuten_akzeptiert')?.checked,
            agb_akzeptiert: document.getElementById('agb_akzeptiert')?.checked,
            datenschutz_akzeptiert: document.getElementById('datenschutz_akzeptiert')?.checked,
            netzbetreiber_vollmacht: document.getElementById('netzbetreiber_vollmacht')?.checked,
            kundennummer_netzbetreiber: val('kundennummer_netzbetreiber'),
            inventarnummer_zaehler: val('inventarnummer_zaehler')
        };

        if (!data.statuten_akzeptiert || !data.agb_akzeptiert || !data.datenschutz_akzeptiert || !data.netzbetreiber_vollmacht) {
            alert('Bitte alle Bestätigungen akzeptieren');
            return null;
        }

        return data;
    }

    function collectVoluntaryData() {
        let ww = val('warmwasser_typ');
        if (ww === '__sonstiges') {
            ww = val('warmwasser_sonstige') || 'Sonstige';
        }
        return {
            eauto_anzahl: val('eauto_anzahl') || null,
            eauto_batteriekapazitaet: val('eauto_batteriekapazitaet') || null,
            eauto_jahreskilometer: val('eauto_jahreskilometer') || null,
            warmwasser_typ: ww || null
        };
    }

    // --- DYNAMIC UI ---
    function addZählpunkt(typ) {
        const container = typ === 'bezug'
            ? document.getElementById('bezugZaehlpunkte')
            : document.getElementById('einspeisungZaehlpunkte');

        const idx = container.querySelectorAll('.zp-entry').length;
        const div = document.createElement('div');
        div.className = 'zp-entry';
        div.dataset.idx = idx;

        let extra = '';
        if (typ === 'einspeisung') {
            extra = `
                <div class="form-row">
                    <div class="form-group">
                        <label>PV-Leistung (kWp)</label>
                        <input type="number" class="zp-pv" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>Rückspeise-Limitierung (kW)</label>
                        <input type="number" class="zp-limit" step="0.1">
                    </div>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="form-row">
                <div class="form-group flex-3">
                    <label>Zählpunktnummer *</label>
                    <input type="text" class="zp-nummer" placeholder="AT 003000 00000000000 00000000000000 00" required>
                    <small class="validation-hint"></small>
                </div>
                <button type="button" class="btn-icon btn-remove-zp" title="Entfernen">&times;</button>
            </div>
            ${extra}
        `;

        div.querySelector('.btn-remove-zp').addEventListener('click', () => div.remove());
        container.appendChild(div);

        // Netzbetreiber-Detection auf neues Feld haengen
        Autofill.setupZaehlpunktNetzbetreiber(container);
    }

    function addSpeicher() {
        const container = document.getElementById('energiespeicher');
        const div = document.createElement('div');
        div.className = 'speicher-entry';
        div.innerHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>Typ</label>
                    <select class="speicher-typ">
                        <option value="">-</option>
                        <option>Batterie</option>
                        <option>Warmwasserspeicher</option>
                        <option value="__sonstiges">Sonstige</option>
                    </select>
                </div>
                <div class="form-group speicher-sonstige-group" style="display:none">
                    <label>Bitte angeben</label>
                    <input type="text" class="speicher-sonstige" placeholder="Welcher Typ?">
                </div>
                <div class="form-group">
                    <label>Kapazität (kWh)</label>
                    <input type="number" class="speicher-kwh" step="0.1">
                </div>
                <button type="button" class="btn-icon btn-remove-zp" title="Entfernen">&times;</button>
            </div>
        `;
        div.querySelector('.btn-remove-zp').addEventListener('click', () => div.remove());
        const sel = div.querySelector('.speicher-typ');
        sel.addEventListener('change', () => {
            div.querySelector('.speicher-sonstige-group').style.display = sel.value === '__sonstiges' ? 'block' : 'none';
        });
        container.appendChild(div);
    }

    function buildZpDetails() {
        // Zahlpunkte aus Step 4 lesen und Detail-Formulare bauen
        const container = document.getElementById('zpDetails');
        container.innerHTML = '';

        const allZps = [];
        document.querySelectorAll('#bezugZaehlpunkte .zp-entry, #einspeisungZaehlpunkte .zp-entry').forEach(el => {
            const nr = el.querySelector('.zp-nummer')?.value?.trim();
            if (nr) allZps.push(nr);
        });

        if (allZps.length === 0) {
            container.innerHTML = '<p>Keine Zählpunkte eingetragen.</p>';
            return;
        }

        allZps.forEach((nr, idx) => {
            const div = document.createElement('div');
            div.className = 'zp-detail form-section';
            div.dataset.zpId = idx;
            div.innerHTML = `
                <h3>Adresse des Zählpunkts ${nr.slice(0, 8)}...</h3>
                <div class="form-row">
                    <div class="form-group flex-2"><label>Strasse</label><input type="text" class="zp-strasse"></div>
                    <div class="form-group form-group-sm"><label>Nummer</label><input type="text" class="zp-hausnr"></div>
                </div>
                <div class="form-row">
                    <div class="form-group form-group-sm"><label>PLZ</label><input type="text" class="zp-plz" maxlength="4"></div>
                    <div class="form-group flex-2"><label>Ort</label><input type="text" class="zp-ort"></div>
                    <div class="form-group"><label>Teilnahmefaktor</label>
                        <div class="input-group"><input type="number" class="zp-faktor" value="100" min="0" max="100"><span>Prozent</span></div>
                    </div>
                    <div class="form-group"><label>Jahresstromverbrauch</label>
                        <div class="input-group"><input type="number" class="zp-verbrauch"><span>kWh</span></div>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-copy-address" data-idx="${idx}">Von Hauptadresse kopieren</button>
            `;

            div.querySelector('.btn-copy-address').addEventListener('click', () => {
                div.querySelector('.zp-strasse').value = val('strasse') || '';
                div.querySelector('.zp-hausnr').value = val('hausnummer') || '';
                div.querySelector('.zp-plz').value = val('plz') || '';
                div.querySelector('.zp-ort').value = val('ort') || '';
            });

            container.appendChild(div);
        });
    }

    // --- HELPERS ---
    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function highlightField(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('input-error');
            el.focus();
            el.addEventListener('input', () => el.classList.remove('input-error'), { once: true });
        }
    }

    function showErrors(errors) {
        const first = Object.keys(errors)[0];
        alert(Object.values(errors).join('\n'));
        if (first) highlightField(first);
    }

    function setupLiveValidation() {
        const hookField = (id, validatorFn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('blur', () => Validators.validateField(el, validatorFn));
        };

        hookField('iban', Validators.iban);
        hookField('plz', Validators.plz);
        hookField('email', Validators.email);
        hookField('uid_nummer', Validators.uid);
        hookField('firmenbuchnummer', Validators.firmenbuchnummer);

        // Zahlpunkt-Nummern (delegiert) + Netzbetreiber-Detection
        document.addEventListener('blur', (e) => {
            if (e.target.classList.contains('zp-nummer')) {
                Validators.validateField(e.target, Validators.zaehlpunkt);
            }
        }, true);

        // Netzbetreiber-Hook auf initialen ZP-Eintrag
        const initial = document.getElementById('bezugZaehlpunkte');
        if (initial) Autofill.setupZaehlpunktNetzbetreiber(initial);
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);
})();
