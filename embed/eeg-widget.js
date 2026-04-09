/**
 * EEG Onboarding Embed-Widget
 * Einbindung auf EEG-Homepages:
 *
 * <script src="https://eeg-portal.at/embed/eeg-widget.js" data-eeg="netzwerk-zukunft"></script>
 * <div id="eeg-onboarding"></div>
 */
(function() {
    const script = document.currentScript;
    const eegSlug = script?.getAttribute('data-eeg');

    if (!eegSlug) {
        console.error('[EEG-Widget] data-eeg Attribut fehlt');
        return;
    }

    const container = document.getElementById('eeg-onboarding');
    if (!container) {
        console.error('[EEG-Widget] Element #eeg-onboarding nicht gefunden');
        return;
    }

    // Base-URL ermitteln
    const baseUrl = script.src.replace('/embed/eeg-widget.js', '');

    // iFrame erstellen
    const iframe = document.createElement('iframe');
    iframe.src = `${baseUrl}/onboarding?eeg=${eegSlug}&embed=1`;
    iframe.style.cssText = 'width:100%;min-height:700px;border:none;border-radius:12px;overflow:hidden;';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('title', 'EEG Onboarding');

    // Hoehe dynamisch anpassen
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'eeg-resize' && event.data.height) {
            iframe.style.height = event.data.height + 'px';
        }
    });

    container.innerHTML = '';
    container.appendChild(iframe);
})();
