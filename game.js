/* Czytam i robię: gra w czytanie dla 5-latków.
   Dziecko czyta krótkie polecenie (WIELKIMI LITERAMI) i robi to, o co ono prosi: zaznacza, liczy, maluje,
   przeciąga, odpowiada TAK / NIE. Poziom sam rośnie po zadaniach bez pomyłki i spada po trudnych. */
'use strict';

/* ======== pokrętła ======== */
const ROUND_TASKS = 10;        // zadań w jednej rundzie
const LEVEL_UP_AFTER = 3;      // tyle zadań z rzędu bez pomyłki = poziom w górę
const LEVEL_DOWN_AFTER = 2;    // tyle zadań z rzędu z HARD_MISTAKES+ pomyłkami = poziom w dół (po cichu)
const HARD_MISTAKES = 2;
const NEXT_DELAY = 1300;       // ms od dobrze zrobionego zadania do następnego
const HINT_IDLE = 25000;       // ms bez dobrej odpowiedzi, po których pojawia się 🔊 (od razu po pomyłce)
const MAX_LEVEL = 6;

// Co jest na którym poziomie: ile obrazków na planszy, ile kolorów i kształtów, jakie rodzaje zadań.
const T1 = ['tapOne', 'selectAll', 'pickWord', 'yesNo'];
const T2 = [...T1, 'count', 'selectN', 'paint'];
const T3 = [...T2, 'category', 'feed', 'order', 'biggest'];
const T4 = [...T3, 'putIn', 'ordinal'];
const T5 = [...T4.filter((t) => t !== 'pickWord'), 'where', 'negation'];
const LEVELS = [null,
  { n: [3, 5], colours: 4, shapes: 3, types: T1 },
  { n: [5, 7], colours: 4, shapes: 5, types: T2 },
  { n: [6, 8], colours: 6, shapes: 5, types: T3 },
  { n: [7, 10], colours: 6, shapes: 5, types: T4 },
  { n: [8, 11], colours: 9, shapes: 5, types: T5 },
  { n: [9, 13], colours: 9, shapes: 5, types: T5 },
];

/* ======== pomocnicze ======== */
const $ = (s) => document.querySelector(s);
const rand = Math.random;
const pick = (a) => a[rand() * a.length | 0];
const randInt = (lo, hi) => lo + (rand() * (hi - lo + 1) | 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const times = (k, f) => Array.from({ length: k }, f);
function shuffle(a, r = rand) {
  for (let i = a.length - 1; i > 0; i--) { const j = r() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sample = (a, k) => shuffle(a.slice()).slice(0, k);
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
const up = (s) => s.toLocaleUpperCase('pl-PL');
const store = {
  get(k, d) { try { const v = localStorage.getItem('czytam.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('czytam.' + k, JSON.stringify(v)); } catch { /* file:// albo zablokowane */ } },
};
const params = new URLSearchParams(location.search);
const TEST = params.has('tbxtest') || navigator.webdriver;
const tbx = (name, data) => window.tbxEvent?.(name, data);

/* ======== odmiana ======== */
// Rzeczownik: mianownik|rodzaj|biernik|mianownik l.mn.|dopełniacz l.mn.|narzędnik|celownik|emoji|tagi
// rodzaj: m = męski nieżywotny, ma = męski żywotny (biernik jak dopełniacz: „kota”), f = żeński, n = nijaki.
// Liczba mnoga zawsze niemęskoosobowa, więc biernik l.mn. = mianownik l.mn.
function noun(row) {
  const [nom, g, acc, pl, gpl, ins, dat, emoji = '', tags = ''] = row.split('|');
  return { nom, g, acc, pl, gpl, ins, dat, emoji, tags: Object.fromEntries(tags.split(' ').filter(Boolean).map((t) => [t, true])) };
}

// Przymiotnik (także liczebnik porządkowy): wszystkie formy, których potrzebują zdania w grze.
function adj(base) {
  const stem = base.slice(0, -1);
  if (base.endsWith('y')) return { m: base, ma: stem + 'ego', fNom: stem + 'a', fAcc: stem + 'ą', n: stem + 'e', pl: stem + 'e', gpl: stem + 'ych' };
  const soft = !/[kg]i$/.test(base);   // trzeci, ostatni → trzecią; niebieski, drugi → niebieską
  return { m: base, ma: stem + 'iego', fNom: stem + (soft ? 'ia' : 'a'), fAcc: stem + (soft ? 'ią' : 'ą'), n: stem + 'ie', pl: stem + 'ie', gpl: stem + 'ich' };
}
function agree(a, nn, c) {
  if (c === 'pl' || c === 'gpl') return a[c];
  if (nn.g === 'f') return c === 'acc' ? a.fAcc : a.fNom;
  if (nn.g === 'n') return a.n;
  return c === 'acc' && nn.g === 'ma' ? a.ma : a.m;
}
// „małe zielone koło”, „małych zielonych kół”…
const np = (nn, adjs, c) => [...adjs.map((a) => agree(a, nn, c)), nn[c]].join(' ');
const NUM = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem'];
// „dwie zielone gwiazdki”, „pięć zielonych gwiazdek” (mianownik i biernik są tu takie same)
function counted(k, nn, adjs = []) {
  if (k === 1) return np(nn, adjs, 'acc');
  if (k <= 4) return `${k === 2 && nn.g === 'f' ? 'dwie' : NUM[k]} ${np(nn, adjs, 'pl')}`;
  return `${NUM[k]} ${np(nn, adjs, 'gpl')}`;
}

/* ======== słowa i obrazki ======== */
const COLOURS = [   // pierwsze cztery od poziomu 1, sześć od 3, wszystkie od 5
  { id: 'czerwony', hex: '#e53935', adv: 'na czerwono' },
  { id: 'zielony', hex: '#43a047', adv: 'na zielono' },
  { id: 'niebieski', hex: '#1e88e5', adv: 'na niebiesko' },
  { id: 'żółty', hex: '#fdd835', adv: 'na żółto' },
  { id: 'różowy', hex: '#ff80ab', adv: 'na różowo' },
  { id: 'fioletowy', hex: '#8e24aa', adv: 'na fioletowo' },
  { id: 'czarny', hex: '#263238', adv: 'na czarno' },
  { id: 'pomarańczowy', hex: '#fb8c00', adv: 'na pomarańczowo' },
  { id: 'brązowy', hex: '#8d6e63', adv: 'na brązowo' },
];
const SHAPES = [    // pierwsze trzy od poziomu 1
  'koło|n|koło|koła|kół|kołem|kołu',
  'kwadrat|m|kwadrat|kwadraty|kwadratów|kwadratem|kwadratowi',
  'trójkąt|m|trójkąt|trójkąty|trójkątów|trójkątem|trójkątowi',
  'gwiazdka|f|gwiazdkę|gwiazdki|gwiazdek|gwiazdką|gwiazdce',
  'serce|n|serce|serca|serc|sercem|sercu',
].map(noun);
const SIZE = { 'duży': 1, 'mały': 0.55 };

// tagi: zw zwierzę, ow owoc, po pojazd, lata / plywa / kola (do „wszystko, co…”), x-… = sporne, nigdy jako zła
// odpowiedź, sucho = zwierzę, które na pewno nie pływa, eat = można dać zwierzęciu, feed = dostaje jedzenie,
// put = można włożyć do kosza, mass = nie do liczenia (nie „trzy miody”), veg = warzywo (nie jest owocem, ale i nie straszymy nim przy owocach)
const THINGS = `
kot|ma|kota|koty|kotów|kotem|kotu|🐱|zw feed
pies|ma|psa|psy|psów|psem|psu|🐶|zw feed
mysz|f|mysz|myszy|myszy|myszą|myszy|🐭|zw feed
królik|ma|królika|króliki|królików|królikiem|królikowi|🐰|zw feed
miś|ma|misia|misie|misiów|misiem|misiowi|🐻|zw feed
świnka|f|świnkę|świnki|świnek|świnką|śwince|🐷|zw feed
krowa|f|krowę|krowy|krów|krową|krowie|🐮|zw feed
koń|ma|konia|konie|koni|koniem|koniowi|🐴|zw feed
małpa|f|małpę|małpy|małp|małpą|małpie|🐵|zw feed
jeż|ma|jeża|jeże|jeży|jeżem|jeżowi|🦔|zw feed
żaba|f|żabę|żaby|żab|żabą|żabie|🐸|zw x-plywa
ryba|f|rybę|ryby|ryb|rybą|rybie|🐟|zw plywa
ptak|ma|ptaka|ptaki|ptaków|ptakiem|ptakowi|🐦|zw lata
kura|f|kurę|kury|kur|kurą|kurze|🐔|zw x-lata
kaczka|f|kaczkę|kaczki|kaczek|kaczką|kaczce|🦆|zw plywa x-lata
słoń|ma|słonia|słonie|słoni|słoniem|słoniowi|🐘|zw
lew|ma|lwa|lwy|lwów|lwem|lwu|🦁|zw
lis|ma|lisa|lisy|lisów|lisem|lisowi|🦊|zw
sowa|f|sowę|sowy|sów|sową|sowie|🦉|zw lata sucho
pszczoła|f|pszczołę|pszczoły|pszczół|pszczołą|pszczole|🐝|zw lata sucho
motyl|ma|motyla|motyle|motyli|motylem|motylowi|🦋|zw lata sucho
ślimak|ma|ślimaka|ślimaki|ślimaków|ślimakiem|ślimakowi|🐌|zw sucho
żółw|ma|żółwia|żółwie|żółwi|żółwiem|żółwiowi|🐢|zw x-plywa
wieloryb|ma|wieloryba|wieloryby|wielorybów|wielorybem|wielorybowi|🐳|zw plywa
ośmiornica|f|ośmiornicę|ośmiornice|ośmiornic|ośmiornicą|ośmiornicy|🐙|zw plywa
jabłko|n|jabłko|jabłka|jabłek|jabłkiem|jabłku|🍎|ow eat put
gruszka|f|gruszkę|gruszki|gruszek|gruszką|gruszce|🍐|ow eat put
banan|ma|banana|banany|bananów|bananem|bananowi|🍌|ow eat put
truskawka|f|truskawkę|truskawki|truskawek|truskawką|truskawce|🍓|ow put
cytryna|f|cytrynę|cytryny|cytryn|cytryną|cytrynie|🍋|ow put
pomarańcza|f|pomarańczę|pomarańcze|pomarańczy|pomarańczą|pomarańczy|🍊|ow put
arbuz|ma|arbuza|arbuzy|arbuzów|arbuzem|arbuzowi|🍉|ow
auto|n|auto|auta|aut|autem|autu|🚗|po kola
rower|m|rower|rowery|rowerów|rowerem|rowerowi|🚲|po kola
autobus|m|autobus|autobusy|autobusów|autobusem|autobusowi|🚌|po kola
pociąg|m|pociąg|pociągi|pociągów|pociągiem|pociągowi|🚂|po kola
traktor|m|traktor|traktory|traktorów|traktorem|traktorowi|🚜|po kola
samolot|m|samolot|samoloty|samolotów|samolotem|samolotowi|✈️|po lata x-kola
helikopter|m|helikopter|helikoptery|helikopterów|helikopterem|helikopterowi|🚁|po lata x-kola
rakieta|f|rakietę|rakiety|rakiet|rakietą|rakiecie|🚀|po lata
statek|m|statek|statki|statków|statkiem|statkowi|🚢|po plywa
łódka|f|łódkę|łódki|łódek|łódką|łódce|⛵|po plywa
piłka|f|piłkę|piłki|piłek|piłką|piłce|⚽|put x-plywa
balon|m|balon|balony|balonów|balonem|balonowi|🎈|x-lata
kwiat|m|kwiat|kwiaty|kwiatów|kwiatem|kwiatowi|🌷|
drzewo|n|drzewo|drzewa|drzew|drzewem|drzewu|🌳|
dom|m|dom|domy|domów|domem|domowi|🏠|
but|m|but|buty|butów|butem|butowi|👟|put
czapka|f|czapkę|czapki|czapek|czapką|czapce|🧢|put
parasol|m|parasol|parasole|parasoli|parasolem|parasolowi|☂️|
klucz|m|klucz|klucze|kluczy|kluczem|kluczowi|🔑|
gitara|f|gitarę|gitary|gitar|gitarą|gitarze|🎸|
książka|f|książkę|książki|książek|książką|książce|📕|put
kość|f|kość|kości|kości|kością|kości|🦴|eat
ser|m|ser|sery|serów|serem|serowi|🧀|eat
marchewka|f|marchewkę|marchewki|marchewek|marchewką|marchewce|🥕|eat put veg
miód|m|miód|miody|miodów|miodem|miodowi|🍯|eat mass
ciastko|n|ciastko|ciastka|ciastek|ciastkiem|ciastku|🍪|eat put
jajko|n|jajko|jajka|jajek|jajkiem|jajku|🥚|put
`.trim().split('\n').map(noun);
const MANY = THINGS.filter((t) => !t.tags.mass);   // to, co da się policzyć

const CATEGORIES = [   // pierwsze trzy od poziomu 3, reszta od 5
  { text: 'zaznacz wszystkie zwierzęta', yes: (t) => t.tags.zw, no: (t) => !t.tags.zw },
  { text: 'zaznacz wszystkie owoce', yes: (t) => t.tags.ow, no: (t) => !t.tags.ow && !t.tags.veg },
  { text: 'zaznacz wszystkie pojazdy', yes: (t) => t.tags.po, no: (t) => !t.tags.po },
  { text: 'zaznacz wszystko, co lata', yes: (t) => t.tags.lata, no: (t) => !t.tags.lata && !t.tags['x-lata'] },
  { text: 'zaznacz wszystko, co pływa', yes: (t) => t.tags.plywa, no: (t) => !t.tags.plywa && !t.tags['x-plywa'] && (!t.tags.zw || t.tags.sucho) },
  { text: 'zaznacz wszystko, co ma koła', yes: (t) => t.tags.kola, no: (t) => !t.tags.kola && !t.tags['x-kola'] },
];

const CONTAINERS = [
  { emoji: '🧺', to: 'do kosza' },
  { emoji: '📦', to: 'do pudełka' },
  { emoji: '🪣', to: 'do wiadra' },
];

// „Co to jest?”: słowo|obrazek|podobne słowa do wyboru
const WORDS = `
kot|🐱|koc koń koza
koń|🐴|kot koc koło
lis|🦊|las lew los
lew|🦁|lis len las
dom|🏠|dym dąb dół
ser|🧀|sok sen sos
ryba|🐟|rana rura rama
mysz|🐭|miś misa masa
miś|🐻|mysz misa most
kura|🐔|kora kurz rura
koza|🐐|kosa kora kasa
żaba|🐸|żubr ława szafa
but|👟|bat buda buk
nos|👃|noc nóż los
oko|👁️|okno ucho osa
sowa|🦉|sofa kosa soda
łódka|⛵|łatka łydka ławka
motyl|🦋|motor mydło motyka
pies|🐶|pas piec lis
słoń|🐘|słońce słoik słup
słońce|☀️|słoń słoik serce
jabłko|🍎|jajko jagoda łóżko
jajko|🥚|jabłko jagoda mleko
krab|🦀|kran grab kraj
balon|🎈|balet salon banan
banan|🍌|balon baran bank
auto|🚗|autobus lato autor
rower|🚲|rowek komar rogal
lody|🍦|lato wody loty
kosz|🧺|kosa koc koszula
zebra|🦓|zegar kobra żubr
kaczka|🦆|kaszka taczka kasza
serce|❤️|słońce serek sarna
noga|🦵|nota nora woda
ręka|✋|rzeka raki mąka
chmura|☁️|chata chmiel kura
`.trim().split('\n').map((r) => { const [word, emoji, wrong] = r.split('|'); return { word, emoji, wrong: wrong.split(' ') }; });

// „Czy…?”: zdanie|1 = prawda, 0 = nieprawda
const FACTS = `
kot miauczy|1
pies szczeka|1
ryba pływa|1
ptak lata|1
krowa daje mleko|1
trawa jest zielona|1
śnieg jest biały|1
słoń jest duży|1
mysz jest mała|1
banan jest żółty|1
lód jest zimny|1
ogień jest gorący|1
żaba skacze|1
auto ma koła|1
pszczoła robi miód|1
kura znosi jajka|1
pies ma cztery łapy|1
ptak ma skrzydła|1
w nocy jest ciemno|1
zimą pada śnieg|1
truskawka jest czerwona|1
ślimak jest wolny|1
zebra ma paski|1
krowa lata|0
ryba chodzi|0
kot szczeka|0
pies miauczy|0
śnieg jest czarny|0
słoń jest mały|0
mysz jest duża|0
ogień jest zimny|0
lód jest gorący|0
trawa jest niebieska|0
banan jest niebieski|0
ślimak jest szybki|0
auto ma skrzydła|0
ryba ma nogi|0
kot ma skrzydła|0
drzewo chodzi|0
kamień jest miękki|0
krowa szczeka|0
pies ma sześć łap|0
słońce świeci w nocy|0
truskawka jest niebieska|0
dom chodzi|0
`.trim().split('\n').map((r) => { const [s, ok] = r.split('|'); return { s, ok: ok === '1' }; });

const CHEERS = ['brawo!', 'super!', 'świetnie!', 'tak jest!', 'ekstra!', 'doskonale!', 'wspaniale!'];

/* ======== kształty ======== */
const STAR = range(0, 9).map((i) => {
  const r = i % 2 ? 20 : 47, a = -Math.PI / 2 + i * Math.PI / 5;
  return (50 + r * Math.cos(a)).toFixed(1) + ',' + (55 + r * Math.sin(a)).toFixed(1);
}).join(' ');
const SHAPE_SVG = {
  'koło': '<circle cx="50" cy="50" r="42"/>',
  'kwadrat': '<rect x="11" y="11" width="78" height="78" rx="7"/>',
  'trójkąt': '<polygon points="50,7 95,89 5,89"/>',
  'gwiazdka': `<polygon points="${STAR}"/>`,
  'serce': '<path d="M50 90C22 69 5 51 8 31 11 13 36 6 50 25 64 6 89 13 92 31 95 51 78 69 50 90Z"/>',
};
function shapeSvg(name, hex) {
  const blank = !hex;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><g class="fill" fill="${hex || '#fff'}" stroke="${blank ? '#8795a3' : 'rgba(0,0,0,.28)'}"
    stroke-width="4" stroke-linejoin="round"${blank ? ' stroke-dasharray="7 6"' : ''}>${SHAPE_SVG[name]}</g></svg>`;
}
function paintEl(s, colour) {
  const g = s.el.querySelector('.fill');
  g.setAttribute('fill', colour ? colour.hex : '#fff');
  g.setAttribute('stroke', colour ? 'rgba(0,0,0,.28)' : '#8795a3');
  if (colour) g.removeAttribute('stroke-dasharray'); else g.setAttribute('stroke-dasharray', '7 6');
}

/* ======== dźwięk i mowa ======== */
const Sound = (() => {
  let ac = null;
  function unlock() {
    if (TEST) return;   // testy w przeglądarce Claude'a są zawsze ciche
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch { ac = null; }
  }
  function note(f, t, d = 0.15, type = 'triangle', v = 0.16) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + t;
    o.type = type; o.frequency.setValueAtTime(f, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(v, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(g).connect(ac.destination);
    o.start(at); o.stop(at + d + 0.05);
  }
  return {
    unlock,
    tap: () => note(660, 0, 0.07, 'triangle', 0.1),
    ok: () => { note(784, 0, 0.12); note(1046, 0.07, 0.18); },
    bad: () => { note(233, 0, 0.16, 'sine', 0.2); note(196, 0.11, 0.24, 'sine', 0.18); },
    done: () => [523, 659, 784, 1046].forEach((f, i) => note(f, i * 0.08, 0.26)),
    win: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => note(f, i * 0.13, 0.32)),
  };
})();

const Speech = (() => {
  const ok = 'speechSynthesis' in window && !TEST;
  let voice = null;
  const find = () => { voice = speechSynthesis.getVoices().find((v) => /^pl/i.test(v.lang)) || null; };
  if (ok) { find(); speechSynthesis.addEventListener?.('voiceschanged', find); }
  return {
    ok,
    say(text) {
      if (!ok) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.toLowerCase());
      u.lang = 'pl-PL'; u.rate = 0.85;
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    },
  };
})();

/* ======== plansza ======== */
const stage = $('#stage'), answers = $('#answers'), ask = $('#ask'), sentence = $('#sentence'), sayBtn = $('#say');
let layouts = [];
const relayout = () => layouts.forEach((f) => f());

function makeEl(s, cls = 'it') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = cls;
  el.innerHTML = s.shape ? shapeSvg(s.shape.nom, s.blank ? null : s.colour.hex) : `<span class="em">${s.thing.emoji}</span>`;
  s.el = el;
  stage.append(el);
  return el;
}
// x, y: lewy górny róg obrazka o boku size. Przycisk jest co najmniej MIN_HIT px, żeby mały obrazek też łatwo trafić.
const MIN_HIT = 48;
function place(s, x, y, size) {
  const st = s.el.style, hit = Math.max(size, MIN_HIT), d = (hit - size) / 2;
  st.left = x - d + 'px'; st.top = y - d + 'px'; st.width = st.height = hit + 'px';
  st.setProperty('--v', size + 'px');
  st.fontSize = size * 0.8 + 'px';
}

// Rozrzuca obrazki po kratkach (z jedną lub dwiema pustymi), z lekkim przesunięciem, żeby nie wyglądało jak tabelka.
function scatter(specs, [rx, ry, rw, rh] = [0, 0, 1, 1]) {
  specs.forEach((s) => s.el || makeEl(s));
  const seed = rand() * 2 ** 32 >>> 0;
  layouts.push(() => {
    const W = stage.clientWidth, H = stage.clientHeight, w = W * rw, h = H * rh, n = specs.length, r = seeded(seed);
    let cols = Math.max(1, Math.round(Math.sqrt(n * w / h))), rows = Math.ceil(n / cols);
    if (cols * rows === n && n > 2) { if (w / cols > h / rows) cols++; else rows++; }
    const cw = w / cols, ch = h / rows, base = Math.min(cw, ch, 190) * 0.84;
    const cells = shuffle([...Array(cols * rows).keys()], r);
    specs.forEach((s, i) => {
      const size = base * (s.scale || 1), c = cells[i];
      const x = W * rx + (c % cols + 0.5) * cw + (r() * 2 - 1) * (cw - size) * 0.35;
      const y = H * ry + ((c / cols | 0) + 0.5) * ch + (r() * 2 - 1) * (ch - size) * 0.35;
      place(s, x - size / 2, y - size / 2, size);
    });
  });
}
// Jeden rząd równo rozstawionych obrazków w pasku planszy.
function row(specs, [rx, ry, rw, rh], align = 'middle', max = 170) {
  specs.forEach((s) => s.el || makeEl(s));
  layouts.push(() => {
    const W = stage.clientWidth, H = stage.clientHeight, cw = rw * W / specs.length;
    const size = Math.min(cw * 0.86, rh * H * 0.92, max);
    specs.forEach((s, i) => {
      const sz = size * (s.scale || 1);
      const y = align === 'bottom' ? (ry + rh) * H - sz : (ry + rh / 2) * H - sz / 2;
      place(s, rx * W + (i + 0.5) * cw - sz / 2, y, sz);
    });
  });
}
const centre = (specs) => row(specs, [0.15, 0.08, 0.7, 0.84], 'middle', 260);

function deco(cls, css) {
  const d = document.createElement('div');
  d.className = cls;
  Object.assign(d.style, css);
  stage.append(d);
  return d;
}
function floater(s, emoji) {
  const f = deco('floater', { left: s.el.offsetLeft + s.el.offsetWidth / 2 + 'px', top: s.el.offsetTop + 'px' });
  f.textContent = emoji;
  setTimeout(() => f.remove(), 1000);
}

/* ======== odpowiedzi ======== */
let task = null;

function hit(s, mark = '✓') {
  s.done = true;
  s.el.classList.add('on');
  const b = document.createElement('b');
  b.className = 'tick';
  b.textContent = mark;
  s.el.append(b);
  Sound.ok(); Haptics.buzz('ok');
}
function miss(el) {
  el.classList.remove('oops'); void el.offsetWidth; el.classList.add('oops');
  task.mistakes++;
  Sound.bad(); Haptics.buzz('bad');
  showSay();
}
function onTap(specs, fn) {
  for (const s of specs) s.el.addEventListener('click', () => { if (!task.done && !s.done) fn(s); });
}
function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ans ' + cls;
  b.innerHTML = label;
  b.addEventListener('click', () => { if (!task.done) onClick(b); });
  answers.append(b);
  return b;
}

// Zaznacz / dotknij: dobre obrazki dostają ptaszka, zadanie kończy się po `need` dobrych.
function selectTask(text, specs, ok, need = specs.filter(ok).length, layout = scatter) {
  return {
    text,
    build() {
      layout(specs);
      let got = 0;
      onTap(specs, (s) => { if (ok(s)) { hit(s); if (++got === need) finish(); } else miss(s.el); });
    },
    solve() { specs.filter(ok).slice(0, need).forEach((s) => s.el.click()); },
  };
}

// Odpowiedź przyciskiem pod planszą (liczba, TAK / NIE, słowo).
function answerTask(text, specs, layout, options, correct, cls = '') {
  return {
    text,
    build() {
      layout(specs);
      answers.className = cls;
      for (const o of options) {
        const b = button(o.label, o.cls, () => {
          if (o.value === correct) { b.classList.add('right'); Sound.ok(); finish(); } else { b.classList.add('off'); miss(b); }
        });
        b.dataset.value = o.value;
      }
    },
    solve() { [...answers.children].find((b) => b.dataset.value === String(correct)).click(); },
  };
}

// Przeciąganie (albo: dotknij obrazka, potem miejsca). drop(item, zone) zwraca true = przyjęte, false = pomyłka.
function dragAndDrop(items, zones, drop) {
  let picked = null;
  const zoneAt = (x, y) => zones.find((z) => {
    const r = z.el.getBoundingClientRect(), p = r.width * 0.18;
    return x > r.left - p && x < r.right + p && y > r.top - p && y < r.bottom + p;
  });
  function setPicked(it) {
    if (picked) picked.el.classList.remove('picked');
    picked = it;
    if (it) it.el.classList.add('picked');
    zones.forEach((z) => z.el.classList.toggle('glow', !!it));
  }
  function back(it) {
    it.el.style.transition = 'transform .25s';
    it.el.style.transform = '';
    it.dx = it.dy = 0;
    setTimeout(() => { it.el.style.transition = ''; }, 260);
  }
  function land(it, zone) {
    const res = zone ? drop(it, zone) : null;
    if (res !== true) { if (res === false) miss(it.el); back(it); return; }
    const a = it.el.getBoundingClientRect(), b = zone.el.getBoundingClientRect();
    const tx = b.left + b.width / 2 - (a.left + a.width / 2 - (it.dx || 0));
    const ty = b.top + b.height / 2 - (a.top + a.height / 2 - (it.dy || 0));
    it.gone = true;
    it.el.style.transition = 'transform .3s ease-in, opacity .3s';
    it.el.style.transform = `translate(${tx}px, ${ty}px) scale(.3)`;
    it.el.style.opacity = '0';
    it.el.style.pointerEvents = 'none';
    zone.el.classList.remove('pop'); void zone.el.offsetWidth; zone.el.classList.add('pop');
  }
  for (const it of items) {
    const el = it.el;
    el.classList.add('drag');
    let id = null, sx = 0, sy = 0, moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (task.done || it.gone || id !== null) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
      try { el.setPointerCapture(id); } catch { /* starsze przeglądarki */ }
      el.style.transition = '';
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      it.dx = e.clientX - sx; it.dy = e.clientY - sy;
      if (!moved && Math.hypot(it.dx, it.dy) < 10) return;
      if (!moved) { moved = true; el.classList.add('lift'); setPicked(null); }
      el.style.transform = `translate(${it.dx}px, ${it.dy}px) scale(1.12)`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('lift');
      if (!moved) { it.dx = it.dy = 0; el.style.transform = ''; if (!task.done) { setPicked(picked === it ? null : it); Sound.tap(); } return; }
      land(it, e.type === 'pointerup' && !task.done ? zoneAt(e.clientX, e.clientY) : null);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  for (const z of zones) z.el.addEventListener('click', () => {
    if (task.done || !picked) return;
    const it = picked;
    setPicked(null);
    land(it, z);
  });
  return land;
}

/* ======== zadania ======== */
const coloursOf = (L) => COLOURS.slice(0, LEVELS[L].colours);
const shapesOf = (L) => SHAPES.slice(0, LEVELS[L].shapes);
const howMany = (L) => randInt(...LEVELS[L].n);
const shapeSpec = (L, c = {}) => ({ shape: c.shape || pick(shapesOf(L)), colour: c.colour || pick(coloursOf(L)), scale: c.size ? SIZE[c.size] : 1 });
const fits = (s, c) => (!c.shape || s.shape === c.shape) && (!c.colour || s.colour === c.colour) && (!c.size || s.scale === SIZE[c.size]);
const critAdjs = (c) => [c.size && adj(c.size), c.colour && adj(c.colour.id)].filter(Boolean);

// Czego szukamy: kształtu, koloru, rozmiaru albo ich połączenia. Wyżej częściej po dwie, trzy cechy.
function pickCrit(L, needShape = false) {
  const shape = pick(shapesOf(L)), colour = pick(coloursOf(L)), size = pick(['duży', 'mały']), r = rand();
  if (L === 1) return needShape || r < 0.6 ? { shape } : { colour };
  if (L >= 4 && r < 0.35) return r < 0.12 ? { size, shape } : { size, colour, shape };
  if (r < 0.75) return { colour, shape };
  return needShape || r < 0.88 ? { shape } : { colour };
}
// k kształtów, które pasują, i n - k, które nie pasują; wiele z nich różni się tylko jedną cechą.
function makeSet(L, crit, k, n, sized = !!crit.size) {
  const sc = () => (sized ? pick([1, SIZE['mały']]) : 1);
  const specs = times(k, () => ({ ...shapeSpec(L, crit), scale: crit.size ? SIZE[crit.size] : sc() }));
  const keys = Object.keys(crit);
  for (let guard = 0; specs.length < n && guard < 2000; guard++) {
    const s = { shape: pick(shapesOf(L)), colour: pick(coloursOf(L)), scale: sc() };
    if (keys.length > 1 && rand() < 0.7) { const kk = pick(keys); if (kk === 'size') s.scale = SIZE[crit.size]; else s[kk] = crit[kk]; }
    if (!fits(s, crit)) specs.push(s);
  }
  return shuffle(specs);
}
const things = (t, k) => times(k, () => ({ thing: t }));

const GEN = {
  // DOTKNIJ KOTA · POKAŻ MAŁE ZIELONE KOŁO
  tapOne(L) {
    const verb = pick(['dotknij', 'pokaż', 'znajdź']);
    if (rand() < (L <= 2 ? 0.5 : 0.3)) {
      const set = sample(THINGS, clamp(howMany(L), 3, 9)), t = set[0];
      return selectTask(`${verb} ${t.acc}`, shuffle(set.map((x) => ({ thing: x }))), (s) => s.thing === t);
    }
    const crit = pickCrit(L, true);
    return selectTask(`${verb} ${np(crit.shape, critAdjs(crit), 'acc')}`, makeSet(L, crit, 1, howMany(L), crit.size || L >= 4), (s) => fits(s, crit));
  },

  // ZAZNACZ WSZYSTKIE ZIELONE KWADRATY · ZAZNACZ WSZYSTKO, CO JEST ŻÓŁTE · ZAZNACZ WSZYSTKIE KOTY
  selectAll(L) {
    const k = randInt(2, L < 3 ? 3 : 5), n = Math.max(howMany(L), k + 2);
    if (rand() < (L <= 2 ? 0.3 : 0.15)) {
      const kinds = sample(MANY, randInt(2, 3)), t = kinds[0];
      const specs = shuffle([...things(t, k), ...times(n - k, () => ({ thing: pick(kinds.slice(1)) }))]);
      return selectTask(`zaznacz wszystkie ${t.pl}`, specs, (s) => s.thing === t);
    }
    const crit = pickCrit(L);
    const text = crit.shape ? `zaznacz wszystkie ${np(crit.shape, critAdjs(crit), 'pl')}` : `zaznacz wszystko, co jest ${adj(crit.colour.id).n}`;
    return selectTask(text, makeSet(L, crit, k, n), (s) => fits(s, crit));
  },

  // ILE JEST CZERWONYCH SERC?
  count(L) {
    const max = L < 4 ? 5 : 8, zero = L >= 5;
    const k = zero && rand() < 0.12 ? 0 : randInt(1, max), n = Math.max(howMany(L), k + 2);
    let specs, text;
    if (rand() < 0.3) {
      const kinds = sample(MANY, 3), t = kinds[0];
      specs = shuffle([...things(t, k), ...times(n - k, () => ({ thing: pick(kinds.slice(1)) }))]);
      text = `ile jest ${t.gpl}?`;
    } else {
      const crit = pickCrit(L, true);
      specs = makeSet(L, crit, k, n);
      text = `ile jest ${np(crit.shape, critAdjs(crit), 'gpl')}?`;
    }
    const opts = range(zero ? 0 : 1, max).map((v) => ({ label: String(v), value: v, cls: 'num' }));
    return answerTask(text, specs, scatter, opts, k, 'nums');
  },

  // ZAZNACZ TRZY ZIELONE KOŁA · ZAZNACZ PIĘĆ GWIAZDEK
  selectN(L) {
    const N = randInt(2, [0, 2, 3, 4, 4, 5, 6][L]), have = N + randInt(1, 3), n = Math.max(howMany(L), have + 2);
    if (rand() < 0.3) {
      const kinds = sample(MANY, 3), t = kinds[0];
      const specs = shuffle([...things(t, have), ...times(n - have, () => ({ thing: pick(kinds.slice(1)) }))]);
      return selectTask(`zaznacz ${counted(N, t)}`, specs, (s) => s.thing === t, N);
    }
    const crit = pickCrit(L, true);
    return selectTask(`zaznacz ${counted(N, crit.shape, critAdjs(crit))}`, makeSet(L, crit, have, n), (s) => fits(s, crit), N);
  },

  // POMALUJ KOŁO NA ZIELONO, A SERCE NA ŻÓŁTO
  paint(L) {
    const specs = sample(shapesOf(L), L < 4 ? 3 : L < 5 ? 4 : 5).map((shape) => ({ shape, blank: true, scale: 1 }));
    const pair = L >= 5 && rand() < 0.4 ? specs[0] : null;   // ten sam kształt duży i mały
    if (pair) specs.push({ shape: pair.shape, blank: true, scale: SIZE['mały'] });
    const palette = sample(coloursOf(L), 6);
    const targets = sample(specs, L >= 4 && rand() < 0.6 ? 2 : 1);
    const wants = sample(palette, targets.length);
    targets.forEach((t, i) => { t.want = wants[i]; });
    const phrase = (t) => {
      const adjs = pair && t.shape === pair.shape ? [adj(t.scale === 1 ? 'duży' : 'mały')] : [];
      return `${np(t.shape, adjs, 'acc')} ${t.want.adv}`;
    };
    let brush = null;
    const pots = [];
    return {
      text: 'pomaluj ' + targets.map(phrase).join(', a '),
      build() {
        scatter(shuffle(specs));
        answers.className = 'pots';
        for (const c of palette) {
          const b = button('', 'pot', () => {
            brush = c;
            pots.forEach((p) => p.classList.toggle('on', p === b));
            Sound.tap();
          });
          b.style.setProperty('--c', c.hex);
          b.dataset.colour = c.id;
          b.setAttribute('aria-label', c.id);
          pots.push(b);
        }
        onTap(specs, (s) => {
          if (!brush) { answers.classList.remove('wiggle'); void answers.offsetWidth; answers.classList.add('wiggle'); return; }
          paintEl(s, brush);
          if (s.want === brush) {
            s.done = true;
            s.el.classList.add('pop');
            Sound.ok(); Haptics.buzz('ok');
            if (targets.every((t) => t.done)) finish();
          } else {
            s.done = true;   // nie da się go znowu dotknąć, dopóki kolor nie zejdzie
            miss(s.el);
            setTimeout(() => { paintEl(s, null); s.done = false; }, 700);
          }
        });
      },
      solve() { for (const t of targets) { pots.find((p) => p.dataset.colour === t.want.id).click(); t.el.click(); } },
    };
  },

  // ZAZNACZ WSZYSTKIE ZWIERZĘTA · ZAZNACZ WSZYSTKO, CO LATA
  category(L) {
    const c = pick(CATEGORIES.slice(0, L >= 5 ? 6 : 3));
    const yes = THINGS.filter(c.yes), no = THINGS.filter(c.no);
    const k = randInt(2, Math.min(5, yes.length)), n = Math.min(Math.max(howMany(L), k + 3), k + no.length);
    const specs = shuffle([...sample(yes, k), ...sample(no, n - k)].map((t) => ({ thing: t })));
    return selectTask(c.text, specs, (s) => c.yes(s.thing));
  },

  // DAJ KOŚĆ PSU · DAJ SER MYSZY, A MIÓD MISIOWI
  feed(L) {
    const animals = sample(THINGS.filter((t) => t.tags.feed), L < 5 ? 3 : 4).map((t) => ({ thing: t }));
    const foods = sample(THINGS.filter((t) => t.tags.eat), L < 5 ? 3 : 5).map((t) => ({ thing: t }));
    const pairs = sample(animals, L >= 6 && rand() < 0.5 ? 2 : 1).map((a, i) => ({ animal: a, food: foods[i] }));
    let land;
    return {
      text: 'daj ' + pairs.map((p) => `${p.food.thing.acc} ${p.animal.thing.dat}`).join(', a '),
      build() {
        animals.forEach((a) => makeEl(a, 'it zone'));
        row(animals, [0.02, 0.03, 0.96, 0.42]);
        row(shuffle(foods), [0.02, 0.58, 0.96, 0.36]);
        land = dragAndDrop(foods, animals, (it, z) => {
          const p = pairs.find((q) => !q.fed && q.food === it && q.animal === z);
          if (!p) return false;
          p.fed = true;
          Sound.ok(); Haptics.buzz('ok');
          floater(z, '💛');
          if (pairs.every((q) => q.fed)) setTimeout(finish, 350);
          return true;
        });
      },
      solve() { pairs.forEach((p) => land(p.food, p.animal)); },
    };
  },

  // WŁÓŻ DWA JABŁKA DO KOSZA
  putIn(L) {
    const boxes = sample(CONTAINERS, L < 5 ? 2 : 3).map((c) => ({ thing: c, box: c }));
    const kinds = sample(THINGS.filter((t) => t.tags.put), L < 5 ? 2 : 3), t = kinds[0];
    const N = randInt(1, [0, 0, 0, 0, 2, 3, 4][L]), box = pick(boxes);
    const items = shuffle([...things(t, N + randInt(0, 2)), ...kinds.slice(1).flatMap((o) => things(o, randInt(2, 3)))]);
    let land, got = 0;
    return {
      text: `włóż ${counted(N, t)} ${box.box.to}`,
      build() {
        boxes.forEach((b) => makeEl(b, 'it zone'));
        row(boxes, [0.02, 0.02, 0.96, 0.38]);
        scatter(items, [0, 0.44, 1, 0.56]);
        land = dragAndDrop(items, boxes, (it, z) => {
          if (it.thing !== t || z !== box) return false;
          Sound.ok(); Haptics.buzz('ok');
          let c = z.el.querySelector('.count');
          if (!c) { c = document.createElement('b'); c.className = 'count'; z.el.append(c); }
          c.textContent = ++got;
          if (got === N) setTimeout(finish, 350);
          return true;
        });
      },
      solve() { items.filter((i) => i.thing === t).slice(0, N).forEach((i) => land(i, box)); },
    };
  },

  // DOTKNIJ KOTA, A POTEM PSA · DOTKNIJ PO KOLEI: RYBĘ, PTAKA I KOTA
  order(L) {
    const k = L < 5 ? 2 : 3, set = sample(THINGS, k + randInt(2, 3)), seq = set.slice(0, k);
    const specs = shuffle(set.map((t) => ({ thing: t })));
    const text = k === 3 ? `dotknij po kolei: ${seq[0].acc}, ${seq[1].acc} i ${seq[2].acc}`
      : pick([`dotknij ${seq[0].acc}, a potem ${seq[1].acc}`, `najpierw dotknij ${seq[0].acc}, potem ${seq[1].acc}`]);
    return {
      text,
      build() {
        scatter(specs);
        let i = 0;
        onTap(specs, (s) => { if (s.thing === seq[i]) { hit(s, String(i + 1)); if (++i === k) finish(); } else miss(s.el); });
      },
      solve() { seq.forEach((t) => specs.find((s) => s.thing === t).el.click()); },
    };
  },

  // DOTKNIJ NAJWIĘKSZĄ GWIAZDKĘ · DOTKNIJ NAJMNIEJSZE ZIELONE KOŁO
  biggest(L) {
    const dir = pick(['największy', 'najmniejszy']), SC = [1, 0.82, 0.67, 0.54, 0.43];
    const crit = { shape: pick(shapesOf(L)) };
    if (L >= 5 && rand() < 0.5) crit.colour = pick(coloursOf(L));
    const scales = sample(SC, randInt(3, 4));
    const specs = scales.map((scale) => ({ ...shapeSpec(L, crit), scale }));
    for (let i = randInt(2, 4), guard = 0; i > 0 && guard < 500; guard++) {
      const s = { ...shapeSpec(L), scale: pick(SC) };
      if (crit.colour && rand() < 0.5) s.shape = crit.shape;
      if (!fits(s, crit)) { specs.push(s); i--; }
    }
    const want = dir === 'największy' ? Math.max(...scales) : Math.min(...scales);
    return selectTask(`dotknij ${np(crit.shape, [adj(dir), ...critAdjs(crit)], 'acc')}`, shuffle(specs), (s) => fits(s, crit) && s.scale === want);
  },

  // DOTKNIJ TRZECI BALON · DOTKNIJ DRUGĄ RYBĘ (w rzędzie z kotami)
  ordinal(L) {
    const ORD = ['pierwszy', 'drugi', 'trzeci', 'czwarty', 'piąty'];
    let specs, mine, t;
    if (L < 5 || rand() < 0.4) {
      t = pick(MANY);
      specs = things(t, 5);
      mine = specs;
    } else {
      const [a, b] = sample(MANY, 2), m = randInt(3, 4);
      t = a;
      specs = shuffle([...things(a, m), ...things(b, 6 - m)]);
      mine = specs.filter((s) => s.thing === a);
    }
    const idx = randInt(0, mine.length - 1);
    const word = idx === mine.length - 1 && (idx > 4 || rand() < 0.6) ? 'ostatni' : ORD[idx];
    const target = mine[idx];
    const layout = (sp) => {
      const arrow = deco('arrow', {});
      arrow.textContent = '➜';
      row(sp, [0.1, 0.2, 0.89, 0.6]);
      layouts.push(() => { const h = stage.clientHeight; arrow.style.fontSize = Math.min(stage.clientWidth * 0.08, 60) + 'px'; arrow.style.top = h / 2 + 'px'; });
    };
    return selectTask(`dotknij ${agree(adj(word), t, 'acc')} ${t.acc}`, specs, (s) => s === target, 1, layout);
  },

  // DOTKNIJ TO, CO JEST POD KOTEM
  where(L) {
    const cols = L < 6 ? 3 : 4, set = sample(THINGS, cols * 2).map((t) => ({ thing: t }));
    const top = set.slice(0, cols), bottom = set.slice(cols), c = randInt(0, cols - 1), dir = pick(['nad', 'pod']);
    const ref = dir === 'pod' ? top[c] : bottom[c], ans = dir === 'pod' ? bottom[c] : top[c];
    const layout = () => {
      deco('shelf', { top: '46%' });
      deco('shelf', { top: '93%' });
      row(top, [0.03, 0.04, 0.94, 0.42], 'bottom');
      row(bottom, [0.03, 0.51, 0.94, 0.42], 'bottom');
    };
    return selectTask(`dotknij to, co jest ${dir} ${ref.thing.ins}`, set, (s) => s === ans, 1, layout);
  },

  // ZAZNACZ WSZYSTKIE KOŁA OPRÓCZ CZERWONYCH · ZAZNACZ WSZYSTKO, CO NIE JEST ZIELONE · …ZWIERZĘTA OPRÓCZ KOTÓW
  negation(L) {
    const v = rand();
    if (v < 0.4) {
      const shape = pick(shapesOf(L)), X = pick(coloursOf(L)), others = sample(coloursOf(L).filter((c) => c !== X), 3);
      const specs = [
        ...times(randInt(1, 3), () => ({ shape, colour: X, scale: 1 })),
        ...times(randInt(2, 4), () => ({ shape, colour: pick(others), scale: 1 })),
      ];
      for (let i = randInt(2, 4); i > 0;) { const s = shapeSpec(L); if (s.shape !== shape) { specs.push(s); i--; } }
      return selectTask(`zaznacz wszystkie ${shape.pl} oprócz ${adj(X.id).gpl}`, shuffle(specs), (s) => s.shape === shape && s.colour !== X);
    }
    if (v < 0.7) {
      const X = pick(coloursOf(L)), n = howMany(L), k = randInt(2, 4);
      const specs = [...times(n - k, () => shapeSpec(L, { colour: X }))];
      for (let i = k; i > 0;) { const s = shapeSpec(L); if (s.colour !== X) { specs.push(s); i--; } }
      return selectTask(`zaznacz wszystko, co nie jest ${adj(X.id).n}`, shuffle(specs), (s) => s.colour !== X);
    }
    const cat = pick([['zwierzęta', 'zw'], ['pojazdy', 'po'], ['owoce', 'ow']]);
    const yes = MANY.filter((t) => t.tags[cat[1]]), no = THINGS.filter((t) => !t.tags[cat[1]] && !t.tags.veg);
    const [ex, ...rest] = sample(yes, randInt(3, 4));
    const specs = shuffle([
      ...things(ex, randInt(2, 3)),
      ...rest.map((t) => ({ thing: t })),
      ...sample(no, randInt(1, 3)).map((t) => ({ thing: t })),
    ]);
    return selectTask(`zaznacz wszystkie ${cat[0]} oprócz ${ex.gpl}`, specs, (s) => s.thing.tags[cat[1]] && s.thing !== ex);
  },

  // CZY KROWA LATA? · CZY TO JEST ZIELONA GWIAZDKA? · CZY SĄ TU TRZY KOŁA?
  yesNo(L) {
    const yes = rand() < 0.5, r = rand();
    const opts = [{ label: 'TAK <span>✔</span>', value: true, cls: 'tak' }, { label: 'NIE <span>✖</span>', value: false, cls: 'nie' }];
    if (L >= 2 && r < 0.35) {
      const f = pick(FACTS.filter((x) => x.ok === yes));
      return answerTask(`czy ${f.s}?`, [{ thing: { emoji: '🤔' } }], centre, opts, yes, 'yn');
    }
    if (L >= 4 && r < 0.6) {
      const crit = { shape: pick(shapesOf(L)), colour: pick(coloursOf(L)) }, k = randInt(2, 6);
      const claim = yes ? k : k === 2 ? 3 : k === 6 ? 5 : k + pick([-1, 1]);
      const specs = makeSet(L, crit, k, k + (L >= 5 ? randInt(2, 4) : 0));
      const what = counted(claim, crit.shape, [adj(crit.colour.id)]);
      return answerTask(claim <= 4 ? `czy są tu ${what}?` : `czy jest tu ${what}?`, specs, scatter, opts, yes, 'yn');
    }
    if (rand() < 0.5) {
      const s = shapeSpec(L), withColour = L > 1 || rand() < 0.5;
      let shape = s.shape, colour = s.colour;
      if (!yes) {
        if (withColour && rand() < 0.5) colour = pick(coloursOf(L).filter((c) => c !== s.colour));
        else shape = pick(shapesOf(L).filter((x) => x !== s.shape));
      }
      return answerTask(`czy to jest ${np(shape, withColour ? [adj(colour.id)] : [], 'nom')}?`, [s], centre, opts, yes, 'yn');
    }
    const t = pick(THINGS), claim = yes ? t : pick(THINGS.filter((x) => x !== t));
    return answerTask(`czy to jest ${claim.nom}?`, [{ thing: t }], centre, opts, yes, 'yn');
  },

  // CO TO JEST? (obrazek i 3–4 podobne słowa)
  pickWord(L) {
    const w = pick(WORDS);
    const opts = shuffle([w.word, ...sample(w.wrong, L === 1 ? 2 : 3)]).map((o) => ({ label: up(o), value: o, cls: 'word' }));
    return answerTask('co to jest?', [{ thing: { emoji: w.emoji } }], centre, opts, w.word, 'words');
  },
};

/* ======== przebieg gry ======== */
let level = clamp(Number(params.get('level')) || store.get('level', 1), 1, MAX_LEVEL);
const FORCE = GEN[params.get('type')] ? params.get('type') : null;
let results = [], cleanRun = 0, hardRun = 0, bag = [], lastType = null, idleTimer = 0, nextTimer = 0;

function nextType() {
  const types = LEVELS[level].types;
  bag = bag.filter((t) => types.includes(t));
  if (!bag.length) bag = shuffle(types.slice());
  if (bag.length > 1 && bag[bag.length - 1] === lastType) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  return (lastType = bag.pop());
}

function nextTask(type) {
  clearTimeout(nextTimer);
  stage.replaceChildren();
  answers.replaceChildren();
  answers.className = '';
  layouts = [];
  hideSay();
  const ty = type || FORCE || nextType();
  task = GEN[ty](level);
  Object.assign(task, { type: ty, mistakes: 0, done: false });
  sentence.textContent = up(task.text);
  fitSentence();
  task.build();
  relayout();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showSay, HINT_IDLE);
}

function finish() {
  if (task.done) return;
  task.done = true;
  clearTimeout(idleTimer);
  Sound.done(); Haptics.buzz('win');
  results.push(task.mistakes);
  tbx('task-end', { type: task.type, level, mistakes: task.mistakes });
  const up1 = adapt();
  cheer(up1);
  drawProgress();
  nextTimer = setTimeout(() => (results.length >= ROUND_TASKS ? endRound() : nextTask()), NEXT_DELAY);
}

// Poziom w górę po LEVEL_UP_AFTER czystych zadaniach z rzędu, w dół (bez ogłaszania) po kilku trudnych.
function adapt() {
  const m = task.mistakes;
  cleanRun = m === 0 ? cleanRun + 1 : 0;
  hardRun = m >= HARD_MISTAKES ? hardRun + 1 : 0;
  let raised = false;
  if (cleanRun >= LEVEL_UP_AFTER && level < MAX_LEVEL) { level++; cleanRun = 0; raised = true; }
  if (hardRun >= LEVEL_DOWN_AFTER && level > 1) { level--; hardRun = 0; }
  store.set('level', level);
  drawLevel();
  return raised;
}

function cheer(raised) {
  const c = $('#cheer');
  c.innerHTML = `<span>${up(pick(CHEERS))}</span>${raised ? `<small>⭐ POZIOM ${level}</small>` : ''}`;
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
}

function startRound() {
  Sound.unlock();
  results = []; bag = []; cleanRun = hardRun = 0;
  $('#start').hidden = true; $('#end').hidden = true;
  drawProgress(); drawLevel();
  tbx('round-start', { level });
  nextTask();
}

function endRound() {
  const clean = results.filter((m) => m === 0).length;
  tbx('round-end', { level, clean });
  Sound.win(); Haptics.buzz('win');
  $('#end-stars').innerHTML = results.map((m) => `<i class="${m ? 'meh' : ''}">⭐</i>`).join('');
  $('#end-level').textContent = `POZIOM ${level}`;
  $('#end').hidden = false;
}

function drawProgress() {
  $('#progress').innerHTML = range(0, ROUND_TASKS - 1).map((i) =>
    i < results.length ? `<i class="star${results[i] ? ' meh' : ''}">⭐</i>` : `<i class="${i === results.length ? 'now' : ''}"></i>`).join('');
}
function drawLevel() { $('#level-btn').textContent = `POZIOM ${level}`; }

/* ======== podpowiedź 🔊 i dopasowanie tekstu ======== */
function showSay() { if (Speech.ok && task && !task.done) { sayBtn.hidden = false; ask.classList.add('has-say'); fitSentence(); } }
function hideSay() { sayBtn.hidden = true; ask.classList.remove('has-say'); }
sayBtn.addEventListener('click', () => { if (task) Speech.say(task.text); });

// Największa czcionka, przy której całe zdanie mieści się w ramce, a żadne słowo nie wystaje.
function fitSentence() {
  const maxH = ask.clientHeight - 12;
  let size = Math.min(64, ask.clientWidth / 6);
  sentence.style.fontSize = size + 'px';
  while (size > 15 && (sentence.scrollHeight > maxH || sentence.scrollWidth > sentence.clientWidth + 1)) sentence.style.fontSize = (size -= 2) + 'px';
}

new ResizeObserver(() => { relayout(); fitSentence(); }).observe(stage);
new ResizeObserver(fitSentence).observe(ask);
document.fonts?.ready.then(fitSentence);
addEventListener('pointerdown', () => Sound.unlock(), { capture: true, once: true });

/* ======== ekran startowy ======== */
function drawLevelPicker() {
  const box = $('#levels');
  box.innerHTML = '';
  for (let l = 1; l <= MAX_LEVEL; l++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lvl' + (l === level ? ' on' : '');
    b.textContent = l;
    b.addEventListener('click', () => { level = l; store.set('level', l); drawLevelPicker(); Sound.tap(); });
    box.append(b);
  }
}
$('#play').addEventListener('click', startRound);
$('#again').addEventListener('click', startRound);
$('#level-btn').addEventListener('click', () => { drawLevelPicker(); $('#start').hidden = false; });
drawLevelPicker(); drawLevel(); drawProgress();

// Do testów: __cz.next('feed'), __cz.solve(), __cz.gen('count', 4) → samo zdanie.
window.__cz = {
  get task() { return task; },
  get level() { return level; },
  setLevel(l) { level = l; drawLevel(); },
  next: (type) => nextTask(type),
  solve: () => task && !task.done && task.solve(),
  gen: (type, L) => GEN[type](L).text,
  start: startRound,
};
