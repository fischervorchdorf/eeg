/**
 * API-Client fuer das Onboarding
 */
const OnboardingAPI = {
    baseUrl: '/api/onboarding',
    applicationId: null,
    passphrase: null,

    headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this.passphrase) h['X-Passphrase'] = this.passphrase;
        return h;
    },

    async loadEeg(slug) {
        const res = await fetch(`${this.baseUrl}/eeg/${slug}`);
        return res.json();
    },

    async loadMemberTypes() {
        const res = await fetch(`${this.baseUrl}/member-types`);
        return res.json();
    },

    async start(eegId, memberTypeId) {
        const res = await fetch(`${this.baseUrl}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eeg_id: eegId, member_type_id: memberTypeId })
        });
        const data = await res.json();
        if (data.success) {
            this.applicationId = data.application_id;
            this.passphrase = data.passphrase;
            // In localStorage speichern fuer Resume
            localStorage.setItem('eeg_app_id', data.application_id);
            localStorage.setItem('eeg_passphrase', data.passphrase);
        }
        return data;
    },

    async saveStep(step, data) {
        const res = await fetch(`${this.baseUrl}/${this.applicationId}/step/${step}`, {
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        return res.json();
    },

    async uploadDocuments(kategorie, files) {
        const formData = new FormData();
        formData.append('kategorie', kategorie);
        for (const file of files) {
            formData.append('files', file);
        }

        const res = await fetch(`${this.baseUrl}/${this.applicationId}/step/dokumente`, {
            method: 'POST',
            headers: { 'X-Passphrase': this.passphrase },
            body: formData
        });
        return res.json();
    },

    async submit() {
        const res = await fetch(`${this.baseUrl}/${this.applicationId}/submit`, {
            method: 'POST',
            headers: this.headers()
        });
        return res.json();
    },

    async resume(appId, passphrase) {
        this.applicationId = appId;
        this.passphrase = passphrase;
        const res = await fetch(`${this.baseUrl}/${appId}/resume`, {
            headers: { 'X-Passphrase': passphrase }
        });
        return res.json();
    },

    // Gespeicherte Session wiederherstellen
    restoreSession() {
        const appId = localStorage.getItem('eeg_app_id');
        const passphrase = localStorage.getItem('eeg_passphrase');
        if (appId && passphrase) {
            this.applicationId = parseInt(appId);
            this.passphrase = passphrase;
            return true;
        }
        return false;
    },

    clearSession() {
        localStorage.removeItem('eeg_app_id');
        localStorage.removeItem('eeg_passphrase');
        this.applicationId = null;
        this.passphrase = null;
    }
};
