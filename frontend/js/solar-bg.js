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
        panelW: 120,        // Breite eines Panels
        panelH: 80,         // Höhe eines Panels
        gap: 18,            // Abstand zwischen Panels
        cellsX: 6,          // Interne Zellen horizontal
        cellsY: 4,          // Interne Zellen vertikal
        waveSpeed: 0.0012,  // Geschwindigkeit der Lichtwelle
        waveWidth: 0.35,    // Breite der Lichtwelle (0-1)
        particleCount: 60,  // Anzahl Energie-Partikel
        fps: 40,
    };

    let W, H, panels = [], particles = [];
    let wavePos = -0.2; // Position der Lichtwelle (0-1 diagonal)

    // Panel-Klasse
    class Panel {
        constructor(x, y, col, row) {
            this.x = x; this.y = y;
            this.col = col; this.row = row;
            this.glow = 0;       // 0-1 aktuelle Helligkeit
            this.baseGlow = 0.05 + Math.random() * 0.08;
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
            const frameAlpha = 0.15 + g * 0.3;
            ctx.fillStyle = `rgba(20, 50, 90, ${frameAlpha})`;
            ctx.strokeStyle = `rgba(60, 140, 220, ${0.1 + g * 0.5})`;
            ctx.lineWidth = 1.2;
            roundRect(ctx, this.x, this.y, pw, ph, 4);
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
                    const cellAlpha = 0.08 + g * 0.55;
                    ctx.fillStyle = g > 0.4
                        ? `rgba(180, 210, 255, ${cellAlpha})`
                        : `rgba(30, 70, 130, ${cellAlpha})`;
                    ctx.fillRect(cx2 + 0.5, cy2 + 0.5, cellW - 1, cellH - 1);

                    // Zellen-Border
                    ctx.strokeStyle = `rgba(80, 160, 240, ${0.06 + g * 0.2})`;
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(cx2 + 0.5, cy2 + 0.5, cellW - 1, cellH - 1);
                }
            }

            // Glanz-Reflex (diagonale Linie)
            if (g > 0.15) {
                const refAlpha = (g - 0.15) * 0.7;
                const grad = ctx.createLinearGradient(this.x, this.y, this.x + pw * 0.6, this.y + ph * 0.6);
                grad.addColorStop(0, `rgba(255, 230, 150, ${refAlpha * 0.8})`);
                grad.addColorStop(0.4, `rgba(255, 255, 255, ${refAlpha * 0.4})`);
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                roundRect(ctx, this.x, this.y, pw, ph, 4);
                ctx.fill();
            }

            // Partikel-Emitter wenn hell genug
            if (g > 0.5 && Math.random() < g * 0.04) {
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

            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
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
        ctx.fillStyle = '#0f1923';
        ctx.fillRect(0, 0, W, H);

        // Subtiler Basis-Gradient
        const bgGrad = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.7);
        bgGrad.addColorStop(0, 'rgba(26,60,115,0.4)');
        bgGrad.addColorStop(0.5, 'rgba(0,80,60,0.15)');
        bgGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Welle weiterbewegen
        wavePos += CFG.waveSpeed;
        if (wavePos > 1.3) wavePos = -0.3;

        // Panels zeichnen
        panels.forEach(p => { p.update(wavePos); p.draw(); });

        // Partikel
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => { p.update(); p.draw(); });

        // Dünner Lichtstrahl entlang der Welle
        if (wavePos > 0 && wavePos < 1) {
            const x1 = wavePos * W * 1.5 - H * 0.5;
            const y1 = 0;
            const x2 = wavePos * W * 1.5 + W * 0.3;
            const y2 = H;
            const rayGrad = ctx.createLinearGradient(x1 - 80, y1, x1 + 80, y1);
            rayGrad.addColorStop(0, 'transparent');
            rayGrad.addColorStop(0.5, 'rgba(255, 230, 150, 0.06)');
            rayGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = rayGrad;
            ctx.fillRect(0, 0, W, H);
        }
    }

    requestAnimationFrame(animate);
})();
