const crypto = require('crypto');

// Deutsche und englische einfache Woerter fuer leicht merkbare Passphrasen
const WORDS = [
    'sonne', 'wind', 'wasser', 'strom', 'licht', 'wald', 'berg', 'fluss',
    'wiese', 'feld', 'garten', 'haus', 'dach', 'wolke', 'regen', 'blume',
    'baum', 'stern', 'mond', 'erde', 'feuer', 'luft', 'kraft', 'gruen',
    'blau', 'gold', 'silber', 'apfel', 'birne', 'kirsche', 'traube', 'nuss',
    'adler', 'fuchs', 'hirsch', 'hase', 'eiche', 'birke', 'linde', 'buche',
    'rose', 'tulpe', 'klee', 'mohn', 'farn', 'moos', 'pilz', 'stein',
    'sand', 'see', 'bach', 'teich', 'quelle', 'bruecke', 'pfad', 'turm',
    'mauer', 'tor', 'ring', 'kette', 'perle', 'korb', 'tisch', 'stuhl',
    'lampe', 'kerze', 'glocke', 'feder', 'anker', 'kompass', 'atlas', 'globe',
    'panda', 'koala', 'tiger', 'loewe', 'dachs', 'otter', 'biber', 'falke',
    'libelle', 'schwalbe', 'amsel', 'drossel', 'lerche', 'sperling', 'rabe', 'eule',
    'forelle', 'lachs', 'barsch', 'hecht', 'karpfen', 'wels', 'krebs', 'muschel',
    'wolke', 'donner', 'blitz', 'schnee', 'frost', 'nebel', 'tau', 'reif',
    'morgen', 'abend', 'nacht', 'sommer', 'winter', 'herbst', 'lenz', 'zeit',
    'freude', 'ruhe', 'friede', 'glueck', 'hoffen', 'traum', 'mut', 'ehre',
    'klang', 'lied', 'tanz', 'spiel', 'fest', 'markt', 'platz', 'park',
    'solar', 'turbo', 'pixel', 'delta', 'omega', 'alpha', 'sigma', 'gamma',
    'echo', 'noble', 'royal', 'rapid', 'flash', 'prime', 'ultra', 'mega',
    'amber', 'coral', 'ivory', 'olive', 'cedar', 'maple', 'aspen', 'lotus',
    'orbit', 'comet', 'lunar', 'venus', 'mars', 'terra', 'nova', 'astro'
];

/**
 * Generiert eine zufaellige Passphrase mit 5 Woertern
 * Beispiel: "sonne-berg-adler-kraft-gruen"
 */
function generatePassphrase(wordCount = 5) {
    const selected = [];
    const used = new Set();

    while (selected.length < wordCount) {
        const idx = crypto.randomInt(WORDS.length);
        if (!used.has(idx)) {
            used.add(idx);
            selected.push(WORDS[idx]);
        }
    }

    return selected.join('-');
}

module.exports = { generatePassphrase };
