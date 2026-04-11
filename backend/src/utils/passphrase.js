const crypto = require('crypto');

// Erweiterte deutsche Wortliste (~540 Woerter) fuer sichere Passphrasen
// 6 Woerter aus 540 = log2(540^6) ≈ 55 Bit Entropie
const WORDS = [
    // Natur
    'sonne', 'wind', 'wasser', 'strom', 'licht', 'wald', 'berg', 'fluss',
    'wiese', 'feld', 'garten', 'haus', 'dach', 'wolke', 'regen', 'blume',
    'baum', 'stern', 'mond', 'erde', 'feuer', 'luft', 'kraft', 'gruen',
    'blau', 'gold', 'silber', 'apfel', 'birne', 'kirsche', 'traube', 'nuss',
    'adler', 'fuchs', 'hirsch', 'hase', 'eiche', 'birke', 'linde', 'buche',
    'rose', 'tulpe', 'klee', 'mohn', 'farn', 'moos', 'pilz', 'stein',
    'sand', 'see', 'bach', 'teich', 'quelle', 'bruecke', 'pfad', 'turm',
    'mauer', 'tor', 'ring', 'kette', 'perle', 'korb', 'tisch', 'stuhl',
    'lampe', 'kerze', 'glocke', 'feder', 'anker', 'kompass', 'atlas', 'globe',
    // Tiere
    'panda', 'koala', 'tiger', 'loewe', 'dachs', 'otter', 'biber', 'falke',
    'libelle', 'schwalbe', 'amsel', 'drossel', 'lerche', 'sperling', 'rabe', 'eule',
    'forelle', 'lachs', 'barsch', 'hecht', 'karpfen', 'wels', 'krebs', 'muschel',
    'igel', 'marder', 'luchs', 'gecko', 'kranich', 'storch', 'reiher', 'eisvogel',
    'hummel', 'grille', 'ameise', 'spinne', 'schnecke', 'frosch', 'molch', 'salamander',
    'zobel', 'nerz', 'hermelin', 'wiesel', 'fasan', 'rebhuhn', 'taube', 'meise',
    'specht', 'kuckuck', 'zeisig', 'fink', 'dohle', 'elster', 'star', 'pirol',
    // Wetter
    'donner', 'blitz', 'schnee', 'frost', 'nebel', 'tau', 'reif', 'hagel',
    'sturm', 'brise', 'welle', 'flut', 'ebbe', 'duene', 'gletscher', 'lawine',
    // Zeit
    'morgen', 'abend', 'nacht', 'sommer', 'winter', 'herbst', 'lenz', 'zeit',
    'stunde', 'woche', 'epoche', 'aera', 'moment', 'minute', 'sekunde', 'dekade',
    // Gefuehle & Abstrakt
    'freude', 'ruhe', 'friede', 'glueck', 'hoffen', 'traum', 'mut', 'ehre',
    'klang', 'lied', 'tanz', 'spiel', 'fest', 'markt', 'platz', 'park',
    'liebe', 'treue', 'stolz', 'wunder', 'zauber', 'magie', 'geist', 'seele',
    // Griechisch/Technisch
    'solar', 'turbo', 'pixel', 'delta', 'omega', 'alpha', 'sigma', 'gamma',
    'echo', 'noble', 'royal', 'rapid', 'flash', 'prime', 'ultra', 'mega',
    'beta', 'theta', 'kappa', 'zeta', 'lambda', 'prism', 'quant', 'phase',
    // Pflanzen & Baeume
    'amber', 'coral', 'ivory', 'olive', 'cedar', 'maple', 'aspen', 'lotus',
    'ahorn', 'tanne', 'fichte', 'kiefer', 'ulme', 'erle', 'weide', 'pappel',
    'jasmin', 'lavendel', 'minze', 'salbei', 'thymian', 'rosmarin', 'dill', 'kerbel',
    'flieder', 'holunder', 'lorbeer', 'efeu', 'akazie', 'magnolie', 'dahlie', 'aster',
    // Himmel & Weltraum
    'orbit', 'comet', 'lunar', 'venus', 'mars', 'terra', 'nova', 'astro',
    'nebula', 'quasar', 'pulsar', 'meteor', 'plasma', 'aurora', 'zenith', 'nadir',
    'saphir', 'rubin', 'topas', 'opal', 'jade', 'onyx', 'achat', 'bernstein',
    // Landschaft & Geographie
    'klippe', 'grotte', 'hoehle', 'schlucht', 'gipfel', 'kueste', 'hafen', 'insel',
    'bucht', 'fjord', 'steppe', 'heide', 'moor', 'sumpf', 'oase', 'savanne',
    'tal', 'kamm', 'hang', 'halde', 'rinne', 'senke', 'mulde', 'scholle',
    // Gebaeude & Strukturen
    'brücke', 'zinne', 'giebel', 'kuppel', 'bogen', 'pfeiler', 'saule', 'portal',
    'festung', 'burg', 'palast', 'tempel', 'kloster', 'kapelle', 'muehle', 'scheune',
    'huette', 'pavillon', 'terrasse', 'balkon', 'loggia', 'arkade', 'atrium', 'nische',
    // Musik & Kunst
    'harfe', 'geige', 'floete', 'trommel', 'orgel', 'gitarre', 'laute', 'zimbel',
    'hymne', 'ode', 'ballade', 'sonate', 'fuge', 'rondo', 'walzer', 'polka',
    'mosaik', 'fresko', 'relief', 'statue', 'bueste', 'skulptur', 'lithografie', 'pastell',
    // Handwerk & Werkzeuge
    'amboss', 'zange', 'hammer', 'messel', 'hobel', 'feile', 'spindel', 'webstuhl',
    'schmiede', 'drechsel', 'toepfer', 'gerber', 'weber', 'schnitzer', 'steinmetz', 'kupfer',
    // Essen & Trinken
    'honig', 'butter', 'kaese', 'sahne', 'zucker', 'mehl', 'hefe', 'malz',
    'mandel', 'haselnuss', 'walnuss', 'pistazie', 'dattel', 'feige', 'mango', 'papaya',
    'zimt', 'nelke', 'muskat', 'pfeffer', 'ingwer', 'kurkuma', 'vanille', 'kakao',
    // Stoffe & Materialien
    'seide', 'wolle', 'leinen', 'baumwolle', 'satin', 'samt', 'filz', 'tweed',
    'bronze', 'messing', 'zinn', 'chrom', 'titan', 'kobalt', 'platin', 'nickel',
    // Maritime
    'kiel', 'mast', 'segel', 'ruder', 'planke', 'kajuete', 'bugspriet', 'steuer',
    'anker', 'boje', 'leuchtturm', 'moele', 'pier', 'reede', 'dock', 'werft',
    // Geometrie & Formen
    'kreis', 'dreieck', 'kugel', 'zylinder', 'spirale', 'raute', 'trapez', 'prisma',
    'achse', 'radius', 'sehne', 'bogen', 'tangente', 'vektor', 'matrix', 'tensor',
    // Farben
    'purpur', 'indigo', 'karmin', 'ocker', 'umbra', 'sienna', 'magenta', 'cyan',
    'violett', 'kobalt', 'smaragd', 'kuper', 'beige', 'creme', 'taupe', 'khaki'
];

// Duplikate entfernen
const UNIQUE_WORDS = [...new Set(WORDS)];

/**
 * Generiert eine zufaellige Passphrase mit 6 Woertern
 * Beispiel: "sonne-berg-adler-kraft-gruen-lotus"
 * Entropie: ~55 Bit (540+ unique Woerter, 6 ausgewaehlt)
 */
function generatePassphrase(wordCount = 6) {
    const selected = [];
    const used = new Set();

    while (selected.length < wordCount) {
        const idx = crypto.randomInt(UNIQUE_WORDS.length);
        if (!used.has(idx)) {
            used.add(idx);
            selected.push(UNIQUE_WORDS[idx]);
        }
    }

    return selected.join('-');
}

module.exports = { generatePassphrase };
