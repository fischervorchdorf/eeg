/**
 * Drag-and-Drop + Click File Upload
 */
function initFileUploads() {
    document.querySelectorAll('.upload-area').forEach(area => {
        const input = area.querySelector('.upload-input');
        const preview = area.querySelector('.upload-preview');
        const kategorie = area.dataset.kategorie;

        // Click to open file dialog
        area.addEventListener('click', (e) => {
            if (e.target === input) return;
            input.click();
        });

        // Drag events
        area.addEventListener('dragover', (e) => {
            e.preventDefault();
            area.classList.add('drag-over');
        });

        area.addEventListener('dragleave', () => {
            area.classList.remove('drag-over');
        });

        area.addEventListener('drop', (e) => {
            e.preventDefault();
            area.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files, kategorie, preview, area);
        });

        // File input change
        input.addEventListener('change', () => {
            handleFiles(input.files, kategorie, preview, area);
        });
    });
}

async function handleFiles(fileList, kategorie, previewEl, area) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const maxSize = 10 * 1024 * 1024; // 10 MB

    for (const file of files) {
        if (file.size > maxSize) {
            alert(`Datei "${file.name}" ist zu gross (max. 10 MB)`);
            return;
        }
    }

    // Upload-Status anzeigen
    area.classList.add('uploading');
    previewEl.innerHTML = '<div class="upload-status">Wird hochgeladen...</div>';

    try {
        const result = await OnboardingAPI.uploadDocuments(kategorie, files);

        if (result.success) {
            previewEl.innerHTML = result.files.map(f => `
                <div class="upload-file">
                    <span class="upload-file-icon">${f.name.endsWith('.pdf') ? '📄' : '🖼️'}</span>
                    <span class="upload-file-name">${f.name}</span>
                    <span class="upload-file-check">&#10003;</span>
                </div>
            `).join('');
            area.classList.add('uploaded');
        } else {
            previewEl.innerHTML = `<div class="upload-error">${result.error || 'Upload fehlgeschlagen'}</div>`;
        }
    } catch (err) {
        previewEl.innerHTML = '<div class="upload-error">Upload fehlgeschlagen</div>';
    }

    area.classList.remove('uploading');
}
