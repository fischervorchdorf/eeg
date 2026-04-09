/**
 * Solar Panel Background Animation
 * Zeichnet ein animiertes Solarpanel-Gitter im Hintergrund.
 */
(function () {
    const canvas = document.getElementById('solarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // --- Konfiguration ---
    const CFG = {
        panelW: 110,        // Breite eines Panels
        panelH: 72,         // Höhe eines Panels
        gap: 14,            // Abstand zwischen Panels
        cellsX: 6,          // Interne Zellen horizontal
        cellsY: 4,          // Interne Zellen vertikal
        waveSpeed: 0.0008,  // Geschwindigkeit der Lichtwelle
        waveWidth: 0.4,     // Breite der Lichtwelle (0-1)
        particleCount: 80,  // Anzahl Energie-Partikel
        fps: 40,
    };

    let W, H, panels = [], particles = [];
    let wavePos = -0.2; // Position der Lichtwelle (0-1 diagonal)

    // Panel-Klasse
    class Panel {
        constructor(x, y, col, row) {
            this.x = x; this.y = y;
            this.col = col; this.row = row;
            this.glow = 0;
            this.baseGlow = 0.12 + Math.random() * 0.12;
        }

        // Diagonal-Position für Wellenberechnung (0-1)
        get diagPos() {
            return (this.x / W + this.y / H) / 2;
        }

        update(wave) {
            const dist = Math.abs(this.diagPos - wave);
            const inWave = dist < CFG.waveWidth / 2;
            const target = inWave
                ? this.baseGlow + (1 - dist / (CFG.waveWidth / 2)) * 0.85
                : this.baseGlow;
            this.glow += (target - this.glow) * 0.06;
        }

        draw() {
            const { panelW: pw, panelH: ph, cellsX: cx, cellsY: cy } = CFG;
            const g = this.glow;

            // Panel-Rahmen
            const frameAlpha = 0.25 + g * 0.35;
            ctx.fillStyle = `rgba(10, 28, 60, ${frameAlpha})`;
            ctx.strokeStyle = g > 0.3
                ? `rgba(0, 210, 140, ${0.15 + g * 0.65})`
                : `rgba(40, 100, 180, ${0.12 + g * 0.4})`;
            ctx.lineWidth = 1.5;
            roundRect(ctx, this.x, this.y, pw, ph, 5);
            ctx.fill();
            ctx.stroke();

            // Solarzellen-Grid
            const cellW = (pw - 8) / cx;
            const cellH = (ph - 8) / cy;
            const ox = this.x + 4, oy = this.y + 4;

            for (let row = 0; row < cy; row++) {
                for (let col = 0; col < cx; col++) {
                    const cx2 = ox + col * cellW;
                    const cy2 = oy + row * cellH;

                    // Zellen-Füllung
                    const cellAlpha = 0.12 + g * 0.6;
                    ctx.fillStyle = g > 0.35
                        ? `rgba(0, 220, 160, ${cellAlpha * 0.6})`
                        : `rgba(20, 60, 120, ${cellAlpha})`;
                    ctx.fillRect(cx2 + 0.5, cy2 + 0.5, cellW - 1, cellH - 1);

                    // Zellen-Border
                    ctx.strokeStyle = g > 0.35
                        ? `rgba(0, 230, 160, ${0.1 + g * 0.25})`
                        : `rgba(60, 140, 220, ${0.08 + g * 0.18})`;
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(cx2 + 0.5, cy2 + 0.5, cellW - 1, cellH - 1);
                }
            }

            // Glanz-Reflex
            if (g > 0.2) {
                const refAlpha = (g - 0.2) * 0.65;
                const grad = ctx.createLinearGradient(this.x, this.y, this.x + pw * 0.7, this.y + ph * 0.7);
                grad.addColorStop(0, `rgba(200, 255, 230, ${refAlpha * 0.6})`);
                grad.addColorStop(0.35, `rgba(255, 255, 255, ${refAlpha * 0.25})`);
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                roundRect(ctx, this.x, this.y, pw, ph, 5);
                ctx.fill();
            }

            // Panel-Glow wenn sehr hell
            if (g > 0.55) {
                ctx.shadowColor = 'rgba(0, 220, 150, 0.5)';
                ctx.shadowBlur = 12 * g;
                roundRect(ctx, this.x, this.y, pw, ph, 5);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Partikel-Emitter
            if (g > 0.45 && Math.random() < g * 0.05) {
                spawnParticle(
                    this.x + 4 + Math.random() * (pw - 8),
                    this.y + Math.random() * ph
                );
            }
        }
    }

    // Partikel-Klasse
    class Particle {
        constructor(x, y) {
            this.x = x; this.y = y;
            this.vx = (Math.random() - 0.5) * 0.6;
            this.vy = -(0.4 + Math.random() * 1.2);
            this.life = 1;
            this.decay = 0.008 + Math.random() * 0.012;
            this.size = 1.5 + Math.random() * 2;
            this.type = Math.random() < 0.7 ? 'blue' : 'gold';
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vy *= 0.99; // leichtes Abbremsen
            this.life -= this.decay;
        }

        draw() {
            const alpha = this.life * 0.8;
            const color = this.type === 'blue'
                ? `rgba(100, 180, 255, ${alpha})`
                : `rgba(255, 200, 80, ${alpha})`;

            const radius = Math.max(0, this.size * this.life);
            if (radius <= 0) return;
            ctx.beginPath();
            ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;

            // Glow-Effekt
            ctx.shadowColor = this.type === 'blue' ? '#60a5fa' : '#fbbf24';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    function spawnParticle(x, y) {
        if (particles.length < CFG.particleCount) {
            particles.push(new Particle(x, y));
        }
    }

    // Hilfsfunktion: abgerundetes Rechteck
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    // Panels aufbauen
    function buildPanels() {
        panels = [];
        const { panelW, panelH, gap } = CFG;
        const stepX = panelW + gap;
        const stepY = panelH + gap;
        const cols = Math.ceil(W / stepX) + 1;
        const rows = Math.ceil(H / stepY) + 1;

        const offsetX = -gap / 2;
        const offsetY = -gap / 2;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                panels.push(new Panel(
                    offsetX + col * stepX,
                    offsetY + row * stepY,
                    col, row
                ));
            }
        }
    }

    // Resize
    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
        buildPanels();
    }
    window.addEventListener('resize', resize);
    resize();

    // Animation Loop
    let lastTime = 0;
    const FRAME_MS = 1000 / CFG.fps;

    function animate(ts) {
        requestAnimationFrame(animate);
        if (ts - lastTime < FRAME_MS) return;
        lastTime = ts;

        // Hintergrund
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#080f18';
        ctx.fillRect(0, 0, W, H);

        // Basis-Gradient: dunkelblau → grün-teal
        const bgGrad = ctx.createRadialGradient(W * 0.25, H * 0.15, 0, W * 0.25, H * 0.15, W * 0.8);
        bgGrad.addColorStop(0, 'rgba(10, 40, 90, 0.6)');
        bgGrad.addColorStop(0.4, 'rgba(0, 60, 50, 0.3)');
        bgGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Welle weiterbewegen
        wavePos += CFG.waveSpeed;
        if (wavePos > 1.3) wavePos = -0.3;

        // Panels zeichnen
        panels.forEach(p => { p.update(wavePos); p.draw(); });

        // Partikel
        particles = particles.filter(p => p.life > 0.01);
        particles.forEach(p => { p.update(); p.draw(); });

        // Lichtstrahl entlang der Welle
        if (wavePos > 0 && wavePos < 1) {
            const cx = wavePos * W * 1.4 - H * 0.3;
            const rayGrad = ctx.createLinearGradient(cx - 120, 0, cx + 120, 0);
            rayGrad.addColorStop(0, 'transparent');
            rayGrad.addColorStop(0.4, 'rgba(0, 220, 150, 0.04)');
            rayGrad.addColorStop(0.5, 'rgba(180, 255, 220, 0.09)');
            rayGrad.addColorStop(0.6, 'rgba(0, 220, 150, 0.04)');
            rayGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = rayGrad;
            ctx.fillRect(0, 0, W, H);
        }
    }

    requestAnimationFrame(animate);
})();
