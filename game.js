/* Czytam i robię: gra w czytanie dla 5-latków.
   Dziecko czyta krótkie polecenie (WIELKIMI LITERAMI) i robi to, o co ono prosi: zaznacza, liczy, maluje,
   przeciąga, odpowiada TAK / NIE. Poziom sam rośnie po zadaniach bez pomyłki i spada po trudnych. */
'use strict';

/* ======== pokrętła ======== */
const ROUND_TASKS = 10;        // zadań w jednej rundzie
const LEVEL_TIME = 300;        // s gry na poziomie, zanim może pójść w górę (liczy się tylko czas nad zadaniami)
const TASK_TIME_CAP = 60;      // s: najwięcej, ile jedno zadanie dolicza do LEVEL_TIME (przerwy się nie liczą)
const LEVEL_WINDOW = 8;        // poziom w górę, gdy z ostatnich tylu zadań na nim…
const LEVEL_UP_CLEAN = 0.75;   // …taka część była bez pomyłki
const LEVEL_DOWN_AFTER = 3;    // tyle zadań z rzędu z HARD_MISTAKES+ pomyłkami = poziom w dół (po cichu)
const HARD_MISTAKES = 2;
const NEXT_DELAY = 1300;       // ms od dobrze zrobionego zadania do następnego
const HINT_IDLE = 25000;       // ms bez dobrej odpowiedzi, po których pojawia się 🔊 (od razu po pomyłce)
const MAX_LEVEL = 6;
const SHEET_FROM = 5;          // od tego poziomu „zaznacz wszystkie…” sprawdza dopiero przycisk GOTOWE
const HIDE_FROM = 6;           // od tego poziomu polecenie znika po pierwszym dotknięciu planszy (👁 pokazuje je znowu)
const PEEK_MS = 2500;          // na tyle 👁 pokazuje schowane polecenie

// Co jest na którym poziomie: ile obrazków na planszy, ile kolorów i kształtów, jakie rodzaje zadań.
const T1 = ['tapOne', 'selectAll', 'pickWord', 'yesNo', 'syllables'];
const T2 = [...T1, 'count', 'selectN', 'paint', 'tools', 'feelings'];
const T3 = [...T2, 'category', 'feed', 'order', 'biggest', 'matchPic', 'placeIt', 'makeN', 'compare', 'connect'];
const T4 = [...T3, 'putIn', 'ordinal', 'matchSentence', 'sort', 'dress'];
const T5 = [...T4.filter((t) => t !== 'pickWord'), 'where', 'negation'];
const T6 = [...T5.filter((t) => t !== 'syllables'), 'story'];
const LEVELS = [null,
  { n: [3, 5], colours: 4, shapes: 3, types: T1 },
  { n: [5, 7], colours: 4, shapes: 5, types: T2 },
  { n: [6, 8], colours: 6, shapes: 5, types: T3 },
  { n: [7, 10], colours: 6, shapes: 5, types: T4 },
  { n: [8, 11], colours: 9, shapes: 5, types: T5 },
  { n: [9, 13], colours: 9, shapes: 5, types: T6 },
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
// Rzeczownik: mianownik|rodzaj|biernik|dopełniacz|mianownik l.mn.|dopełniacz l.mn.|narzędnik|celownik|emoji|tagi
// rodzaj: m = męski nieżywotny, ma = męski żywotny (biernik jak dopełniacz: „kota”), f = żeński, n = nijaki.
// Liczba mnoga zawsze niemęskoosobowa, więc biernik l.mn. = mianownik l.mn.
function noun(row) {
  const [nom, g, acc, gen, pl, gpl, ins, dat, emoji = '', tags = ''] = row.split('|');
  return { nom, g, acc, gen, pl, gpl, ins, dat, emoji, tags: Object.fromEntries(tags.split(' ').filter(Boolean).map((t) => [t, true])) };
}

// Przymiotnik (także liczebnik porządkowy): wszystkie formy, których potrzebują zdania w grze.
function adj(base) {
  const stem = base.slice(0, -1);
  if (base.endsWith('y')) return { m: base, ma: stem + 'ego', fNom: stem + 'a', fAcc: stem + 'ą', fGen: stem + 'ej', n: stem + 'e', pl: stem + 'e', gpl: stem + 'ych' };
  const soft = !/[kg]i$/.test(base);   // trzeci, ostatni → trzecią; niebieski, drugi → niebieską
  return { m: base, ma: stem + 'iego', fNom: stem + (soft ? 'ia' : 'a'), fAcc: stem + (soft ? 'ią' : 'ą'), fGen: stem + 'iej', n: stem + 'ie', pl: stem + 'ie', gpl: stem + 'ich' };
}
// c: nom, acc, gen (dopełniacz: „dotknij zielonej gwiazdki”), pl, gpl
function agree(a, nn, c) {
  if (c === 'pl' || c === 'gpl') return a[c];
  if (c === 'gen') return nn.g === 'f' ? a.fGen : a.ma;
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
// To samo, ale z „jeden” przy 1: „jedno jabłko”, „jedną gruszkę”, „jednego banana” (c = acc) / „jedna gruszka” (c = nom)
const ONE = { acc: { m: 'jeden', ma: 'jednego', f: 'jedną', n: 'jedno' }, nom: { m: 'jeden', ma: 'jeden', f: 'jedna', n: 'jedno' } };
const countedOne = (k, nn, c = 'acc') => (k === 1 ? `${ONE[c][nn.g]} ${nn[c]}` : counted(k, nn));
// „z myszą”, ale „ze słoniem”, „ze statkiem” (przed s, z, ś, ź, ż ze spółgłoską)
const withZ = (nn) => (/^[sśzźż][^aąeęioóuy]/.test(nn.ins) ? 'ze ' : 'z ') + nn.ins;
// „pies, kot i mysz”
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} i ${a[a.length - 1]}`);

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
  'koło|n|koło|koła|koła|kół|kołem|kołu',
  'kwadrat|m|kwadrat|kwadratu|kwadraty|kwadratów|kwadratem|kwadratowi',
  'trójkąt|m|trójkąt|trójkąta|trójkąty|trójkątów|trójkątem|trójkątowi',
  'gwiazdka|f|gwiazdkę|gwiazdki|gwiazdki|gwiazdek|gwiazdką|gwiazdce',
  'serce|n|serce|serca|serca|serc|sercem|sercu',
].map(noun);
const SIZE = { 'duży': 1, 'mały': 0.55 };

// tagi: zw zwierzę, ow owoc, po pojazd, lata / plywa / kola (do „wszystko, co…”), x-… = sporne, nigdy jako zła
// odpowiedź, sucho = zwierzę, które na pewno nie pływa, eat = można dać zwierzęciu, feed = dostaje jedzenie,
// put = można włożyć do kosza, mass = nie do liczenia (nie „trzy miody”), veg = warzywo (nie jest owocem, ale i nie straszymy nim przy owocach)
const THINGS = `
kot|ma|kota|kota|koty|kotów|kotem|kotu|🐱|zw feed
pies|ma|psa|psa|psy|psów|psem|psu|🐶|zw feed
mysz|f|mysz|myszy|myszy|myszy|myszą|myszy|🐭|zw feed
królik|ma|królika|królika|króliki|królików|królikiem|królikowi|🐰|zw feed
miś|ma|misia|misia|misie|misiów|misiem|misiowi|🐻|zw feed
świnka|f|świnkę|świnki|świnki|świnek|świnką|śwince|🐷|zw feed
krowa|f|krowę|krowy|krowy|krów|krową|krowie|🐮|zw feed
koń|ma|konia|konia|konie|koni|koniem|koniowi|🐴|zw feed
małpa|f|małpę|małpy|małpy|małp|małpą|małpie|🐵|zw feed
jeż|ma|jeża|jeża|jeże|jeży|jeżem|jeżowi|🦔|zw feed
żaba|f|żabę|żaby|żaby|żab|żabą|żabie|🐸|zw x-plywa
ryba|f|rybę|ryby|ryby|ryb|rybą|rybie|🐟|zw plywa
ptak|ma|ptaka|ptaka|ptaki|ptaków|ptakiem|ptakowi|🐦|zw lata
kura|f|kurę|kury|kury|kur|kurą|kurze|🐔|zw x-lata
kaczka|f|kaczkę|kaczki|kaczki|kaczek|kaczką|kaczce|🦆|zw plywa x-lata
słoń|ma|słonia|słonia|słonie|słoni|słoniem|słoniowi|🐘|zw
lew|ma|lwa|lwa|lwy|lwów|lwem|lwu|🦁|zw
lis|ma|lisa|lisa|lisy|lisów|lisem|lisowi|🦊|zw
sowa|f|sowę|sowy|sowy|sów|sową|sowie|🦉|zw lata sucho
pszczoła|f|pszczołę|pszczoły|pszczoły|pszczół|pszczołą|pszczole|🐝|zw lata sucho
motyl|ma|motyla|motyla|motyle|motyli|motylem|motylowi|🦋|zw lata sucho
ślimak|ma|ślimaka|ślimaka|ślimaki|ślimaków|ślimakiem|ślimakowi|🐌|zw sucho
żółw|ma|żółwia|żółwia|żółwie|żółwi|żółwiem|żółwiowi|🐢|zw x-plywa
wieloryb|ma|wieloryba|wieloryba|wieloryby|wielorybów|wielorybem|wielorybowi|🐳|zw plywa
ośmiornica|f|ośmiornicę|ośmiornicy|ośmiornice|ośmiornic|ośmiornicą|ośmiornicy|🐙|zw plywa
jabłko|n|jabłko|jabłka|jabłka|jabłek|jabłkiem|jabłku|🍎|ow eat put
gruszka|f|gruszkę|gruszki|gruszki|gruszek|gruszką|gruszce|🍐|ow eat put
banan|ma|banana|banana|banany|bananów|bananem|bananowi|🍌|ow eat put
truskawka|f|truskawkę|truskawki|truskawki|truskawek|truskawką|truskawce|🍓|ow put
cytryna|f|cytrynę|cytryny|cytryny|cytryn|cytryną|cytrynie|🍋|ow put
pomarańcza|f|pomarańczę|pomarańczy|pomarańcze|pomarańczy|pomarańczą|pomarańczy|🍊|ow put
arbuz|ma|arbuza|arbuza|arbuzy|arbuzów|arbuzem|arbuzowi|🍉|ow
auto|n|auto|auta|auta|aut|autem|autu|🚗|po kola
rower|m|rower|roweru|rowery|rowerów|rowerem|rowerowi|🚲|po kola
autobus|m|autobus|autobusu|autobusy|autobusów|autobusem|autobusowi|🚌|po kola
pociąg|m|pociąg|pociągu|pociągi|pociągów|pociągiem|pociągowi|🚂|po kola
traktor|m|traktor|traktora|traktory|traktorów|traktorem|traktorowi|🚜|po kola
samolot|m|samolot|samolotu|samoloty|samolotów|samolotem|samolotowi|✈️|po lata x-kola
helikopter|m|helikopter|helikoptera|helikoptery|helikopterów|helikopterem|helikopterowi|🚁|po lata x-kola
rakieta|f|rakietę|rakiety|rakiety|rakiet|rakietą|rakiecie|🚀|po lata
statek|m|statek|statku|statki|statków|statkiem|statkowi|🚢|po plywa
łódka|f|łódkę|łódki|łódki|łódek|łódką|łódce|⛵|po plywa
piłka|f|piłkę|piłki|piłki|piłek|piłką|piłce|⚽|put x-plywa
balon|m|balon|balonu|balony|balonów|balonem|balonowi|🎈|x-lata
kwiat|m|kwiat|kwiatu|kwiaty|kwiatów|kwiatem|kwiatowi|🌷|
drzewo|n|drzewo|drzewa|drzewa|drzew|drzewem|drzewu|🌳|
dom|m|dom|domu|domy|domów|domem|domowi|🏠|
but|m|but|buta|buty|butów|butem|butowi|👟|put
czapka|f|czapkę|czapki|czapki|czapek|czapką|czapce|🧢|put
parasol|m|parasol|parasola|parasole|parasoli|parasolem|parasolowi|☂️|
klucz|m|klucz|klucza|klucze|kluczy|kluczem|kluczowi|🔑|
gitara|f|gitarę|gitary|gitary|gitar|gitarą|gitarze|🎸|
książka|f|książkę|książki|książki|książek|książką|książce|📕|put
kość|f|kość|kości|kości|kości|kością|kości|🦴|eat
ser|m|ser|sera|sery|serów|serem|serowi|🧀|eat
marchewka|f|marchewkę|marchewki|marchewki|marchewek|marchewką|marchewce|🥕|eat put veg
miód|m|miód|miodu|miody|miodów|miodem|miodowi|🍯|eat mass
ciastko|n|ciastko|ciastka|ciastka|ciastek|ciastkiem|ciastku|🍪|eat put
jajko|n|jajko|jajka|jajka|jajek|jajkiem|jajku|🥚|put
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
  { emoji: '🧺', to: 'do kosza', in: 'w koszu', from: 'z kosza' },
  { emoji: '📦', to: 'do pudełka', in: 'w pudełku', from: 'z pudełka' },
  { emoji: '🪣', to: 'do wiadra', in: 'we wiadrze', from: 'z wiadra' },
];
const byNom = (nom) => THINGS.find((t) => t.nom === nom);

// Miejsca do scenek („kot jest pod krzesłem”) i do „połóż piłkę na krześle”: tylko wyrażenia, które pasują do miejsca.
const PLACES = [
  { emoji: '🪑', na: 'na krześle', pod: 'pod krzesłem', obok: 'obok krzesła', nad: 'nad krzesłem' },
  { emoji: '🛏️', na: 'na łóżku', pod: 'pod łóżkiem', obok: 'obok łóżka', nad: 'nad łóżkiem' },
  { emoji: '🌳', na: 'na drzewie', pod: 'pod drzewem', obok: 'obok drzewa', nad: 'nad drzewem' },
  { emoji: '🏠', na: 'na dachu', obok: 'obok domu', nad: 'nad domem' },
  { emoji: '📦', na: 'na pudełku', w: 'w pudełku', obok: 'obok pudełka', nad: 'nad pudełkiem', do: 'do pudełka' },
  { emoji: '🧺', w: 'w koszu', obok: 'obok kosza', nad: 'nad koszem', do: 'do kosza' },
];
const PREPS = ['na', 'pod', 'obok', 'nad', 'w'];
const SCENE_ANIMALS = ['kot', 'pies', 'mysz', 'królik', 'żaba', 'kaczka', 'jeż', 'świnka', 'ptak'].map(byNom);

const MINKA = noun('minka|f|minkę|minki|minki|minek|minką|mince');
const FEELINGS = [   // pierwsze cztery od poziomu 2, wszystkie od 4
  ['wesoły', '😄'], ['smutny', '😢'], ['zły', '😠'], ['śpiący', '😴'], ['zdziwiony', '😮'], ['przestraszony', '😱'],
].map(([a, emoji]) => ({ a: adj(a), emoji }));

// „Ułóż słowo”: sylaby (tak uczy się czytać w polskich przedszkolach) i obrazek
const SYLLABLES = `
ko-za|🐐
ry-ba|🐟
ża-ba|🐸
ku-ra|🐔
so-wa|🦉
ba-lon|🎈
ba-nan|🍌
ro-wer|🚲
mo-tyl|🦋
mał-pa|🐵
kacz-ka|🦆
au-to|🚗
lo-dy|🍦
no-ga|🦵
rę-ka|✋
chmu-ra|☁️
ze-bra|🦓
ser-ce|❤️
słoń-ce|☀️
jabł-ko|🍎
jaj-ko|🥚
pił-ka|⚽
kro-wa|🐮
dy-nia|🎃
li-zak|🍭
gru-szka|🍐
śli-mak|🐌
bał-wan|⛄
ra-kie-ta|🚀
ty-grys|🐯
pa-ra-sol|☂️
gi-ta-ra|🎸
ko-ro-na|👑
po-mi-dor|🍅
cy-try-na|🍋
tru-skaw-ka|🍓
mar-chew-ka|🥕
wie-wiór-ka|🐿️
sa-mo-lot|✈️
he-li-kop-ter|🚁
`.trim().split('\n').map((r) => { const [w, emoji] = r.split('|'); return { syl: w.split('-'), emoji }; });

// „Daj bałwanowi czapkę i szalik”: rzeczy do ubrania i gdzie się je zakłada
const WEAR = `
czapka|czapkę|🧢|head
korona|koronę|👑|head
kapelusz|kapelusz|🎩|head
kokarda|kokardę|🎀|head
okulary|okulary|👓|eyes
marchewka|marchewkę|🥕|nose
szalik|szalik|🧣|neck
miotła|miotłę|🧹|hand
parasol|parasol|☂️|hand
balon|balon|🎈|hand
kwiatek|kwiatek|🌷|hand
buty|buty|👢|feet
`.trim().split('\n').map((r) => { const [nom, acc, emoji, slot] = r.split('|'); return { nom, acc, emoji, slot }; });
const SNOWMAN = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#fff" stroke="#9fb3c8" stroke-width="1.5">
  <circle cx="50" cy="79" r="20"/><circle cx="50" cy="51" r="15"/><circle cx="50" cy="28" r="11"/></g>
  <path d="M37 47 18 35M63 47 82 35" stroke="#7a5230" stroke-width="2.5" stroke-linecap="round"/>
  <g fill="#263238"><circle cx="46" cy="26" r="1.6"/><circle cx="54" cy="26" r="1.6"/><circle cx="50" cy="48" r="1.6"/><circle cx="50" cy="55" r="1.6"/></g></svg>`;
// sloty: [x %, y %, wielkość jako część obrazka]
const FIGURES = [
  { dat: 'bałwanowi', html: SNOWMAN, slots: { head: [50, 13, 0.26], eyes: [50, 26, 0.15], nose: [56, 30, 0.11], neck: [50, 39, 0.22], hand: [83, 33, 0.26] } },
  { dat: 'misiowi', html: '<span class="em">🧸</span>', slots: { head: [50, 15, 0.28], eyes: [50, 33, 0.16], neck: [50, 52, 0.22], hand: [82, 60, 0.24], feet: [50, 90, 0.2] } },
];

// Krótkie historyjki: historyjka i pytanie|dobra odpowiedź|złe odpowiedzi (obrazki albo liczby)
const STORIES = `
ola ma kota. kot jest rudy. kogo ma ola?|🐱|🐶 🐟
kuba jedzie rowerem do parku. czym jedzie kuba?|🚲|🚗 🚌
pies śpi pod drzewem. kot śpi na łóżku. gdzie śpi kot?|🛏️|🌳 📦
staś ma trzy jabłka. zjadł jedno. ile jabłek ma teraz?|2|1 3
pada deszcz. ewa bierze parasol. co bierze ewa?|☂️|🎈 🧢
kura zniosła jajko. co zniosła kura?|🥚|🍎 ⚽
w nocy na niebie świeci księżyc. co świeci w nocy?|🌙|☀️ 🌈
mama upiekła ciasto. kuba zjadł kawałek. co zjadł kuba?|🍰|🍎 🍌
żaba skoczyła do wody. kto skoczył do wody?|🐸|🐟 🦆
ala ma psa i kota. ile zwierząt ma ala?|2|1 3
janek zgubił but. czego szuka janek?|👟|🧢 🔑
zimą ola lepi bałwana. co lepi ola?|⛄|🏠 🚗
kuba dał psu kość. co dostał pies?|🦴|🧀 🥕
wiewiórka zbiera orzechy. kto zbiera orzechy?|🐿️|🐻 🐰
zosia ma cztery kredki. dostała jeszcze jedną. ile kredek ma zosia?|5|3 4
lis jest rudy, a zając jest szary. kto jest rudy?|🦊|🐰 🐻
tata jedzie pociągiem, a mama autobusem. czym jedzie mama?|🚌|🚂 🚗
ewa ma czerwony balon. balon poleciał do nieba. co poleciało do nieba?|🎈|⚽ 🚀
miś lubi miód. co lubi miś?|🍯|🧀 🦴
staś myje ręce mydłem. czym staś myje ręce?|🧼|🥄 🔑
na drzewie siedzi sowa. pod drzewem siedzi jeż. kto siedzi na drzewie?|🦉|🦔 🐱
ola ma pięć balonów. dwa pękły. ile balonów ma ola?|3|2 4
`.trim().split('\n').map((r) => { const [text, ok, wrong] = r.split('|'); return { text, ok, wrong: wrong.split(' ') }; });

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
  if (s.scene) el.classList.add('scene');
  el.innerHTML = s.shape ? shapeSvg(s.shape.nom, s.blank ? null : s.colour.hex)
    : s.scene ? sceneHtml(s)
    : s.html || `<span class="em">${s.thing.emoji}</span>`;
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
// Równa siatka (kartki ze scenkami): cols(W, H, n) mówi, ile kolumn.
function grid(specs, [rx, ry, rw, rh] = [0, 0, 1, 1], cols = (W, H, n) => (n <= 2 || W > H * 1.3 ? n : 2), max = 240) {
  specs.forEach((s) => s.el || makeEl(s));
  layouts.push(() => {
    const SW = stage.clientWidth, SH = stage.clientHeight, W = SW * rw, H = SH * rh, n = specs.length;
    const c = cols(W, H, n), rows = Math.ceil(n / c), cw = W / c, ch = H / rows, size = Math.min(cw, ch, max) * 0.88;
    specs.forEach((s, i) => {
      const r = i / c | 0, inRow = Math.min(c, n - r * c);
      const x = SW * rx + (W - inRow * cw) / 2 + (i % c + 0.5) * cw, y = SH * ry + (H - rows * ch) / 2 + (r + 0.5) * ch;
      place(s, x - size / 2, y - size / 2, size);
      if (s.scene) s.el.style.fontSize = size + 'px';
    });
  });
}
// Scenka: miejsce i zwierzę na nim, pod nim, obok, nad nim albo w nim (wtedy przód pojemnika zasłania zwierzę).
function sceneHtml(s) {
  return `<span class="pl">${s.place.emoji}</span><span class="sb p-${s.prep}">${s.subject.emoji}</span>`
    + (s.prep === 'w' ? `<span class="pl front">${s.place.emoji}</span>` : '');
}

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
function shake(el) { el.classList.remove('oops'); void el.offsetWidth; el.classList.add('oops'); }
function wiggleAnswers() { answers.classList.remove('wiggle'); void answers.offsetWidth; answers.classList.add('wiggle'); }
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
function selectTask(text, specs, ok, need = specs.filter(ok).length, layout = scatter, sheet = false) {
  if (sheet) return sheetTask(text, specs, ok, layout);
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

// „Jak w zeszycie” (od SHEET_FROM): dotknięcie zaznacza albo odznacza bez podpowiedzi, a GOTOWE sprawdza wszystko naraz.
function sheetTask(text, specs, ok, layout = scatter) {
  const mark = (s, on) => {
    s.marked = on;
    s.el.classList.toggle('on', on);
    s.el.querySelector('.tick')?.remove();
    if (on) { const b = document.createElement('b'); b.className = 'tick'; b.textContent = '✓'; s.el.append(b); }
  };
  return {
    text,
    build() {
      layout(specs);
      for (const s of specs) s.el.addEventListener('click', () => { if (!task.done) { mark(s, !s.marked); Sound.tap(); } });
      answers.className = 'one';
      button('GOTOWE ✔', 'done', (b) => {
        const wrong = specs.filter((s) => s.marked && !ok(s)), missing = specs.filter((s) => !s.marked && ok(s));
        if (!wrong.length && !missing.length) { b.classList.add('right'); Sound.ok(); finish(); return; }
        miss(wrong.length ? wrong[0].el : b);   // jedna pomyłka za jedno sprawdzenie
        wrong.forEach((s) => { mark(s, false); shake(s.el); });
      });
    },
    solve() { specs.filter(ok).forEach((s) => s.el.click()); answers.querySelector('.done').click(); },
  };
}
const sheetAt = (L) => L >= SHEET_FROM;

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
// Miejsce z co najmniej trzema pasującymi przyimkami, zwierzę i jeden z przyimków.
function pickScene() {
  const place = pick(PLACES.filter((pl) => PREPS.filter((q) => pl[q]).length >= 3)), preps = PREPS.filter((q) => place[q]);
  return { place, preps, subject: pick(SCENE_ANIMALS), prep: pick(preps) };
}
// Równa siatka bez losowania (od razu, w środku innego układu): obrazki w koszu i obok niego.
function gridAt(list, [rx, ry, rw, rh], max = 120) {
  const W = stage.clientWidth * rw, H = stage.clientHeight * rh, n = Math.max(list.length, 1);
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * W / H))), rows = Math.ceil(n / cols), cw = W / cols, ch = H / rows;
  const size = Math.min(cw, ch, max) * 0.84;
  list.forEach((s, i) => place(s, stage.clientWidth * rx + (i % cols + 0.5) * cw - size / 2, stage.clientHeight * ry + ((i / cols | 0) + 0.5) * ch - size / 2, size));
}
// „dotknij” chce dopełniacza (dotknij piłki), „pokaż” i „znajdź” biernika (pokaż piłkę)
const VERBS = [['dotknij', 'gen'], ['pokaż', 'acc'], ['znajdź', 'acc']];

const GEN = {
  // DOTKNIJ KOTA · POKAŻ MAŁE ZIELONE KOŁO · DOTKNIJ ZIELONEJ GWIAZDKI
  tapOne(L) {
    const [verb, c] = pick(VERBS);
    if (rand() < (L <= 2 ? 0.5 : 0.3)) {
      const set = sample(THINGS, clamp(howMany(L), 3, 9)), t = set[0];
      return selectTask(`${verb} ${t[c]}`, shuffle(set.map((x) => ({ thing: x }))), (s) => s.thing === t);
    }
    const crit = pickCrit(L, true);
    return selectTask(`${verb} ${np(crit.shape, critAdjs(crit), c)}`, makeSet(L, crit, 1, howMany(L), crit.size || L >= 4), (s) => fits(s, crit));
  },

  // ZAZNACZ WSZYSTKIE ZIELONE KWADRATY · ZAZNACZ WSZYSTKO, CO JEST ŻÓŁTE · ZAZNACZ WSZYSTKIE KOTY
  selectAll(L) {
    const k = randInt(2, L < 3 ? 3 : 5), n = Math.max(howMany(L), k + 2);
    if (rand() < (L <= 2 ? 0.3 : 0.15)) {
      const kinds = sample(MANY, randInt(2, 3)), t = kinds[0];
      const specs = shuffle([...things(t, k), ...times(n - k, () => ({ thing: pick(kinds.slice(1)) }))]);
      return selectTask(`zaznacz wszystkie ${t.pl}`, specs, (s) => s.thing === t, undefined, scatter, sheetAt(L));
    }
    if (L >= 3 && rand() < 0.3) return GEN.selectBoth(L);
    const crit = pickCrit(L);
    const text = crit.shape ? `zaznacz wszystkie ${np(crit.shape, critAdjs(crit), 'pl')}` : `zaznacz wszystko, co jest ${adj(crit.colour.id).n}`;
    return selectTask(text, makeSet(L, crit, k, n), (s) => fits(s, crit), undefined, scatter, sheetAt(L));
  },

  // ZAZNACZ WSZYSTKIE KOTY I PSY · ZAZNACZ CZERWONE KOŁA I NIEBIESKIE KWADRATY (wybierane z selectAll)
  selectBoth(L) {
    const n = Math.max(howMany(L), 7);
    if (L < 5 || rand() < 0.5) {
      const kinds = sample(MANY, 4), [A, B] = kinds;
      const specs = shuffle([...things(A, randInt(1, 3)), ...things(B, randInt(1, 3)), ...times(n - 4, () => ({ thing: pick(kinds.slice(2)) }))]);
      return selectTask(`zaznacz wszystkie ${A.pl} i ${B.pl}`, specs, (s) => s.thing === A || s.thing === B, undefined, scatter, sheetAt(L));
    }
    const [s1, s2] = sample(shapesOf(L), 2), [c1, c2] = sample(coloursOf(L), 2);
    const A = { shape: s1, colour: c1 }, B = { shape: s2, colour: c2 };
    const specs = [...times(randInt(1, 3), () => ({ ...A, scale: 1 })), ...times(randInt(1, 3), () => ({ ...B, scale: 1 }))];
    for (let guard = 0; specs.length < n && guard < 500; guard++) {   // te same kształty w zamienionych kolorach i inne
      const x = rand() < 0.5 ? { shape: pick([s1, s2]), colour: pick([c1, c2]), scale: 1 } : shapeSpec(L);
      if (!fits(x, A) && !fits(x, B)) specs.push(x);
    }
    return selectTask(`zaznacz ${np(s1, [adj(c1.id)], 'pl')} i ${np(s2, [adj(c2.id)], 'pl')}`, shuffle(specs), (s) => fits(s, A) || fits(s, B), undefined, scatter, sheetAt(L));
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

  // POMALUJ KOŁO NA ZIELONO, A SERCE NA ŻÓŁTO · POMALUJ DWA KOŁA NA CZERWONO
  paint(L) {
    const palette = sample(coloursOf(L), 6);
    let specs, text, ok, done, steps;
    if (L >= 4 && rand() < 0.35) {
      const [K, ...rest] = sample(shapesOf(L), 3), N = randInt(2, L < 6 ? 3 : 4), c = pick(palette);
      specs = [...times(N + randInt(1, 2), () => ({ shape: K, blank: true, scale: 1 })), ...rest.map((shape) => ({ shape, blank: true, scale: 1 }))];
      text = `pomaluj ${counted(N, K)} ${c.adv}`;
      ok = (s, brush) => s.shape === K && brush === c;
      done = () => specs.filter((s) => s.painted).length === N;
      steps = specs.filter((s) => s.shape === K).slice(0, N).map((s) => [c, s]);
    } else {
      specs = sample(shapesOf(L), L < 4 ? 3 : L < 5 ? 4 : 5).map((shape) => ({ shape, blank: true, scale: 1 }));
      const pair = L >= 5 && rand() < 0.4 ? specs[0] : null;   // ten sam kształt duży i mały
      if (pair) specs.push({ shape: pair.shape, blank: true, scale: SIZE['mały'] });
      const targets = sample(specs, L >= 4 && rand() < 0.6 ? 2 : 1);
      const wants = sample(palette, targets.length);
      targets.forEach((t, i) => { t.want = wants[i]; });
      const phrase = (t) => {
        const adjs = pair && t.shape === pair.shape ? [adj(t.scale === 1 ? 'duży' : 'mały')] : [];
        return `${np(t.shape, adjs, 'acc')} ${t.want.adv}`;
      };
      text = 'pomaluj ' + targets.map(phrase).join(', a ');
      ok = (s, brush) => s.want === brush;
      done = () => targets.every((t) => t.painted);
      steps = targets.map((t) => [t.want, t]);
    }
    let brush = null;
    const pots = [];
    return {
      text,
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
          if (!brush) { wiggleAnswers(); return; }
          paintEl(s, brush);
          s.done = true;   // pomalowany: nie da się go znowu dotknąć (zły kolor schodzi po chwili)
          if (ok(s, brush)) {
            s.painted = true;
            s.el.classList.add('pop');
            Sound.ok(); Haptics.buzz('ok');
            if (done()) finish();
          } else {
            miss(s.el);
            setTimeout(() => { paintEl(s, null); s.done = false; }, 700);
          }
        });
      },
      solve() { for (const [c, t] of steps) { pots.find((p) => p.dataset.colour === c.id).click(); t.el.click(); } },
    };
  },

  // ZAZNACZ WSZYSTKIE ZWIERZĘTA · ZAZNACZ WSZYSTKO, CO LATA
  category(L) {
    const c = pick(CATEGORIES.slice(0, L >= 5 ? 6 : 3));
    const yes = THINGS.filter(c.yes), no = THINGS.filter(c.no);
    const k = randInt(2, Math.min(5, yes.length)), n = Math.min(Math.max(howMany(L), k + 3), k + no.length);
    const specs = shuffle([...sample(yes, k), ...sample(no, n - k)].map((t) => ({ thing: t })));
    return selectTask(c.text, specs, (s) => c.yes(s.thing), undefined, scatter, sheetAt(L));
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

  // DOTKNIJ KOTA, A POTEM PSA · DOTKNIJ PO KOLEI: RYBY, PTAKA I KOTA
  order(L) {
    const k = L < 5 ? 2 : 3, set = sample(THINGS, k + randInt(2, 3)), seq = set.slice(0, k);
    const specs = shuffle(set.map((t) => ({ thing: t })));
    const text = k === 3 ? `dotknij po kolei: ${seq[0].gen}, ${seq[1].gen} i ${seq[2].gen}`
      : pick([`dotknij ${seq[0].gen}, a potem ${seq[1].gen}`, `najpierw dotknij ${seq[0].gen}, potem ${seq[1].gen}`]);
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

  // DOTKNIJ NAJWIĘKSZEJ GWIAZDKI · POKAŻ NAJMNIEJSZE ZIELONE KOŁO
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
    const [verb, c] = pick(VERBS);
    return selectTask(`${verb} ${np(crit.shape, [adj(dir), ...critAdjs(crit)], c)}`, shuffle(specs), (s) => fits(s, crit) && s.scale === want);
  },

  // DOTKNIJ TRZECIEGO BALONU · POKAŻ DRUGĄ RYBĘ (w rzędzie z kotami)
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
    const [verb, c] = pick(VERBS);
    return selectTask(`${verb} ${agree(adj(word), t, c)} ${t[c]}`, specs, (s) => s === target, 1, layout);
  },

  // DOTKNIJ TEGO, CO JEST POD KOTEM
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
    return selectTask(`dotknij tego, co jest ${dir} ${ref.thing.ins}`, set, (s) => s === ans, 1, layout);
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
      return selectTask(`zaznacz wszystkie ${shape.pl} oprócz ${adj(X.id).gpl}`, shuffle(specs), (s) => s.shape === shape && s.colour !== X, undefined, scatter, sheetAt(L));
    }
    if (v < 0.7) {
      const X = pick(coloursOf(L)), n = howMany(L), k = randInt(2, 4);
      const specs = [...times(n - k, () => shapeSpec(L, { colour: X }))];
      for (let i = k; i > 0;) { const s = shapeSpec(L); if (s.colour !== X) { specs.push(s); i--; } }
      return selectTask(`zaznacz wszystko, co nie jest ${adj(X.id).n}`, shuffle(specs), (s) => s.colour !== X, undefined, scatter, sheetAt(L));
    }
    const cat = pick([['zwierzęta', 'zw'], ['pojazdy', 'po'], ['owoce', 'ow']]);
    const yes = MANY.filter((t) => t.tags[cat[1]]), no = THINGS.filter((t) => !t.tags[cat[1]] && !t.tags.veg);
    const [ex, ...rest] = sample(yes, randInt(3, 4));
    const specs = shuffle([
      ...things(ex, randInt(2, 3)),
      ...rest.map((t) => ({ thing: t })),
      ...sample(no, randInt(1, 3)).map((t) => ({ thing: t })),
    ]);
    return selectTask(`zaznacz wszystkie ${cat[0]} oprócz ${ex.gpl}`, specs, (s) => s.thing.tags[cat[1]] && s.thing !== ex, undefined, scatter, sheetAt(L));
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

  // UŁÓŻ SŁOWO: obrazek kozy i sylaby ZA · KO (wyżej z dodatkowymi, podobnymi sylabami)
  syllables(L) {
    const pool = SYLLABLES.filter((w) => (L === 1 ? w.syl.length === 2 : L === 2 ? w.syl.length <= 3 : true));
    const w = pick(L >= 3 && rand() < 0.6 ? pool.filter((x) => x.syl.length >= 3) : pool);
    const others = [...new Set(SYLLABLES.flatMap((x) => x.syl))].filter((x) => !w.syl.includes(x));
    const near = shuffle(others.filter((x) => w.syl.some((y) => y[0] === x[0])));   // KO przy KA, RY przy RO…
    const extra = [...new Set([...near, ...shuffle(others)])].slice(0, [0, 0, 1, 2, 2, 2, 2][L]);
    const tiles = shuffle([...w.syl, ...extra]);
    let i = 0, slots = [];
    return {
      text: 'ułóż słowo',
      keep: true,
      build() {
        row([{ thing: { emoji: w.emoji } }], [0.2, 0.03, 0.6, 0.55], 'middle', 220);
        const box = deco('slots', {});
        slots = w.syl.map(() => { const d = document.createElement('span'); d.className = 'slot'; box.append(d); return d; });
        layouts.push(() => { box.style.fontSize = Math.min(46, stage.clientWidth / (w.syl.length * 2.9)) + 'px'; });
        answers.className = 'syls';
        for (const t of tiles) {
          const b = button(up(t), 'syl', () => {
            if (b.classList.contains('used')) return;
            if (t !== w.syl[i]) { miss(b); return; }
            slots[i].textContent = up(t);
            slots[i].classList.add('full');
            b.classList.add('used');
            Sound.ok();
            if (++i === w.syl.length) finish();
          });
          b.dataset.syl = t;
        }
      },
      solve() { for (const x of w.syl) [...answers.children].find((b) => b.dataset.syl === x && !b.classList.contains('used')).click(); },
    };
  },

  // PRZEKREŚL WSZYSTKIE PSY · PRZEKREŚL WSZYSTKIE PSY, A ZAZNACZ KOTY (narzędzia ✓ i ✗ pod planszą)
  tools(L) {
    const two = L >= 3 && rand() < 0.6;
    let specs, groups, text;
    if (!two && rand() < 0.4) {
      const crit = pickCrit(L, true), k = randInt(2, 4);
      specs = makeSet(L, crit, k, Math.max(howMany(L), k + 2));
      groups = [{ tool: 'x', ok: (s) => fits(s, crit) }];
      text = `przekreśl wszystkie ${np(crit.shape, critAdjs(crit), 'pl')}`;
    } else {
      const kinds = sample(MANY, two && L >= 5 ? 4 : 3), [A, B] = kinds, rest = kinds.slice(two ? 2 : 1);
      specs = shuffle([...things(A, randInt(2, 3)), ...(two ? things(B, randInt(2, 3)) : []), ...rest.flatMap((o) => things(o, randInt(1, 2)))]);
      groups = [{ tool: 'x', ok: (s) => s.thing === A }];
      if (two) groups.push({ tool: 'v', ok: (s) => s.thing === B });
      text = !two ? `przekreśl wszystkie ${A.pl}`
        : pick([`przekreśl wszystkie ${A.pl}, a zaznacz ${B.pl}`, `zaznacz wszystkie ${B.pl}, a przekreśl ${A.pl}`]);
    }
    let tool = null;
    const toolBtns = {};
    const left = () => specs.filter((s) => !s.done && groups.some((g) => g.ok(s))).length;
    return {
      text,
      build() {
        scatter(specs);
        answers.className = 'tools';
        for (const [id, label] of [['v', '✓'], ['x', '✗']]) {
          const b = button(label, 'tool tool-' + id, () => {
            tool = id;
            Object.values(toolBtns).forEach((x) => x.classList.toggle('on', x === b));
            Sound.tap();
          });
          toolBtns[id] = b;
        }
        onTap(specs, (s) => {
          if (!tool) { wiggleAnswers(); return; }
          const g = groups.find((x) => x.ok(s));
          if (!g || g.tool !== tool) { miss(s.el); return; }
          if (tool === 'v') hit(s);
          else { s.done = true; s.el.classList.add('crossed'); Sound.ok(); Haptics.buzz('ok'); }
          if (!left()) finish();
        });
      },
      solve() { for (const g of groups) { toolBtns[g.tool].click(); specs.filter(g.ok).forEach((s) => s.el.click()); } },
    };
  },

  // DOTKNIJ SMUTNEJ MINKI · ZAZNACZ WSZYSTKIE WESOŁE MINKI · ILE JEST ŚPIĄCYCH MINEK?
  feelings(L) {
    const kinds = L < 4 ? FEELINGS.slice(0, 4) : FEELINGS, f = pick(kinds);
    const v = L < 3 ? 'one' : pick(L < 4 ? ['one', 'all'] : ['one', 'all', 'count']);
    const face = (x) => ({ thing: { emoji: x.emoji }, feel: x });
    if (v === 'one') {
      const [verb, c] = pick(VERBS);
      const set = shuffle([f, ...sample(kinds.filter((x) => x !== f), Math.min(kinds.length - 1, randInt(2, 5)))]).map(face);
      return selectTask(`${verb} ${agree(f.a, MINKA, c)} ${MINKA[c]}`, set, (s) => s.feel === f);
    }
    const k = v === 'count' ? randInt(L >= 5 ? 0 : 1, 6) : randInt(2, 4), n = Math.max(howMany(L), k + 2);
    const others = kinds.filter((x) => x !== f);
    const set = shuffle([...times(k, () => face(f)), ...times(n - k, () => face(pick(others)))]);
    if (v === 'all') return selectTask(`zaznacz wszystkie ${f.a.pl} ${MINKA.pl}`, set, (s) => s.feel === f, undefined, scatter, sheetAt(L));
    const opts = range(L >= 5 ? 0 : 1, 6).map((x) => ({ label: String(x), value: x, cls: 'num' }));
    return answerTask(`ile jest ${f.a.gpl} ${MINKA.gpl}?`, set, scatter, opts, k, 'nums');
  },

  // ZNAJDŹ OBRAZEK: KOT JEST POD KRZESŁEM (trzy, cztery kartki z tym samym miejscem)
  matchPic(L) {
    const { place, subject, prep, preps } = pickScene();
    const n = L < 5 ? 3 : 4;
    const cards = [{ subject, prep }, ...sample(preps.filter((q) => q !== prep), n - 1).map((q) => ({ subject, prep: q }))];
    if (L >= 5) {   // jedna kartka z innym zwierzęciem w dobrym miejscu: trzeba przeczytać oba słowa
      const other = { subject: pick(SCENE_ANIMALS.filter((a) => a !== subject)), prep };
      if (cards.length >= n) cards[cards.length - 1] = other; else cards.push(other);
    }
    const specs = shuffle(cards.map((c) => ({ scene: true, place, ...c })));
    return selectTask(`znajdź obrazek: ${subject.nom} jest ${place[prep]}`, specs, (s) => s.subject === subject && s.prep === prep, 1, (sp) => grid(sp));
  },

  // KTÓRE ZDANIE PASUJE? (jedna scenka i trzy prawie takie same zdania)
  matchSentence(L) {
    const { place, subject, prep, preps } = pickScene();
    const say = (a, q) => `${a.nom} jest ${place[q]}`;
    const wrong = sample(preps.filter((q) => q !== prep), L >= 5 ? 1 : 2).map((q) => say(subject, q));
    if (L >= 5) wrong.push(say(pick(SCENE_ANIMALS.filter((a) => a !== subject)), prep));
    const right = say(subject, prep);
    const opts = shuffle([right, ...wrong]).map((x) => ({ label: up(x), value: x, cls: 'sent' }));
    const t = answerTask('które zdanie pasuje?', [{ scene: true, place, subject, prep }], (sp) => grid(sp, [0.15, 0.04, 0.7, 0.92]), opts, right, 'sents');
    t.keep = true;
    return t;
  },

  // POŁÓŻ PIŁKĘ POD KRZESŁEM · WŁÓŻ BUT DO PUDEŁKA (przeciągnij na jedno z miejsc wokół)
  placeIt(L) {
    const SPOTS = ['na', 'pod', 'obok', 'w'];
    const loc = pick(PLACES.filter((p) => SPOTS.filter((q) => p[q]).length >= 3));
    const spots = SPOTS.filter((q) => loc[q]).map((prep) => ({ thing: { emoji: '' }, prep }));
    const items = sample(MANY.filter((t) => t.tags.put), 4).map((t) => ({ thing: t }));
    const asks = sample(spots, L >= 6 && rand() < 0.5 ? 2 : 1).map((spot, i) => ({ spot, item: items[i] }));
    const say = (a) => (a.spot.prep === 'w' ? `włóż ${a.item.thing.acc} ${loc.do}` : `połóż ${a.item.thing.acc} ${loc[a.spot.prep]}`);
    let land;
    return {
      text: asks.map(say).join(', a '),
      build() {
        const pl = deco('big-place', {});
        pl.textContent = loc.emoji;
        spots.forEach((s) => makeEl(s, 'it zone spot'));
        layouts.push(() => {
          const W = stage.clientWidth, H = stage.clientHeight, P = Math.min(W * 0.42, H * 0.36), S = P * 0.5, cx = W / 2, cy = H * 0.38;
          Object.assign(pl.style, { left: cx - P / 2 + 'px', top: cy - P / 2 + 'px', width: P + 'px', height: P + 'px', fontSize: P * 0.85 + 'px' });
          const at = { na: [cx, cy - P / 2 - S * 0.35], pod: [cx, cy + P / 2 + S * 0.35], obok: [cx + P / 2 + S * 0.62, cy + P * 0.2], w: [cx, cy + P * 0.05] };
          spots.forEach((s) => { const [x, y] = at[s.prep]; place(s, x - S / 2, y - S / 2, S); });
        });
        row(shuffle(items.slice()), [0.04, 0.8, 0.92, 0.18]);
        land = dragAndDrop(items, spots, (it, z) => {
          const a = asks.find((q) => !q.done && q.item === it && q.spot === z);
          if (!a) return false;
          a.done = true;
          z.el.innerHTML = `<span class="em">${it.thing.emoji}</span>`;
          z.el.classList.add('filled');
          Sound.ok(); Haptics.buzz('ok');
          if (asks.every((q) => q.done)) setTimeout(finish, 350);
          return true;
        });
      },
      solve() { asks.forEach((a) => land(a.item, a.spot)); },
    };
  },

  // W KOSZU MAJĄ BYĆ TRZY JABŁKA · DOŁÓŻ DO KOSZA JEDNO JABŁKO · WYJMIJ Z KOSZA DWA · ZOSTAW W KOSZU TYLKO GRUSZKI
  makeN(L) {
    const box = pick(CONTAINERS), [t, o] = sample(MANY.filter((x) => x.tags.put), 2);
    const v = pick(L >= 5 ? ['be', 'add', 'take', 'only'] : ['be', 'add', 'take']);
    let inside, target, text, inO = 0;
    if (v === 'be') {
      target = randInt(1, L < 5 ? 4 : 6);
      do inside = randInt(0, 6); while (inside === target);
      text = `${box.in} ${target >= 2 && target <= 4 ? 'mają' : 'ma'} być ${countedOne(target, t, 'nom')}`;
    } else if (v === 'add') {
      const N = randInt(1, L < 5 ? 2 : 3);
      inside = randInt(1, 3); target = inside + N;
      text = `dołóż ${box.to} ${countedOne(N, t)}`;
    } else if (v === 'take') {
      const N = randInt(1, L < 5 ? 2 : 3);
      inside = N + randInt(1, 3); target = inside - N;
      text = `wyjmij ${box.from} ${countedOne(N, t)}`;
    } else {
      inside = target = randInt(2, 4); inO = randInt(2, 3);
      text = `zostaw ${box.in} tylko ${t.pl}`;
    }
    const outside = v === 'only' ? 1 : Math.max(target, inside) - inside + 2;
    const specs = shuffle([
      ...times(inside, () => ({ thing: t, inside: true })),
      ...times(inO, () => ({ thing: o, inside: true })),
      ...times(outside, () => ({ thing: t, inside: false })),
    ]);
    const isRight = () => specs.filter((s) => s.inside && s.thing === t).length === target && !specs.some((s) => s.inside && s.thing !== t);
    return {
      text,
      build() {
        const basket = deco('basket', {});
        basket.innerHTML = `<span>${box.emoji}</span>`;
        specs.forEach((s) => makeEl(s));
        layouts.push(() => {
          gridAt(specs.filter((s) => s.inside), [0.06, 0.13, 0.88, 0.4], 90);
          gridAt(specs.filter((s) => !s.inside), [0.04, 0.62, 0.92, 0.36], 90);
        });
        onTap(specs, (s) => { s.inside = !s.inside; relayout(); Sound.tap(); });
        answers.className = 'one';
        button('GOTOWE ✔', 'done', (b) => {
          if (isRight()) { b.classList.add('right'); Sound.ok(); finish(); } else { miss(b); shake(basket); }
        });
      },
      solve() {
        const inT = () => specs.filter((s) => s.inside && s.thing === t);
        specs.filter((s) => s.inside && s.thing !== t).forEach((s) => s.el.click());
        while (inT().length > target) inT()[0].el.click();
        while (inT().length < target) specs.find((s) => !s.inside && s.thing === t).el.click();
        answers.querySelector('.done').click();
      },
    };
  },

  // CZEGO JEST WIĘCEJ: KÓŁ CZY GWIAZDEK? (na poziomie 6 czasem TYLE SAMO)
  compare(L) {
    const more = rand() < 0.5, eq = L >= 6 && rand() < 0.25, minDiff = L < 5 ? 2 : 1;
    const a = randInt(1, 7);
    let b = a;
    if (!eq) do b = randInt(1, 7); while (Math.abs(a - b) < minDiff);
    let specs, A, B, icon;
    if (rand() < 0.5) {
      const [x, y, z] = sample(MANY, 3);
      A = x; B = y;
      specs = [...things(x, a), ...things(y, b), ...(L >= 5 ? things(z, randInt(1, 3)) : [])];
      icon = (n) => `<span class="em">${n.emoji}</span>`;
    } else {
      const [x, y, z] = sample(shapesOf(L), 3);
      A = x; B = y;
      const one = (sh) => ({ shape: sh, colour: pick(coloursOf(L)), scale: 1 });
      specs = [...times(a, () => one(x)), ...times(b, () => one(y)), ...(L >= 5 ? times(randInt(1, 3), () => one(z)) : [])];
      icon = (n) => shapeSvg(n.nom, '#7a8794');
    }
    const right = a === b ? 'eq' : (a > b) === more ? 'a' : 'b';
    const opts = [{ label: icon(A), value: 'a', cls: 'pic' }, { label: icon(B), value: 'b', cls: 'pic' }];
    if (L >= 6) opts.push({ label: 'TYLE SAMO', value: 'eq', cls: 'word' });
    return answerTask(`czego jest ${more ? 'więcej' : 'mniej'}: ${A.gpl} czy ${B.gpl}?`, shuffle(specs), scatter, opts, right, 'pics');
  },

  // WŁÓŻ OWOCE DO KOSZA, A POJAZDY DO PUDEŁKA · WŁÓŻ KOŁA DO KOSZA, A KWADRATY DO WIADRA
  sort(L) {
    const [b1, b2] = sample(CONTAINERS, 2).map((c) => ({ thing: c, box: c }));
    const k = L < 6 ? 3 : 4, v = rand();
    let g1, g2, extra = [], text;
    if (v < 0.45) {
      const [c1, c2, c3] = shuffle([['owoce', 'ow'], ['pojazdy', 'po'], ['zwierzęta', 'zw']]);
      const of = (c, n) => sample(MANY.filter((t) => t.tags[c[1]]), n).map((t) => ({ thing: t }));
      g1 = of(c1, k); g2 = of(c2, k); if (L >= 6) extra = of(c3, 2);
      text = `włóż ${c1[0]} ${b1.box.to}, a ${c2[0]} ${b2.box.to}`;
    } else if (v < 0.75) {
      const [s1, s2, s3] = sample(shapesOf(L), 3), one = (sh) => ({ shape: sh, colour: pick(coloursOf(L)), scale: 1 });
      g1 = times(k, () => one(s1)); g2 = times(k, () => one(s2)); if (L >= 6) extra = times(2, () => one(s3));
      text = `włóż ${s1.pl} ${b1.box.to}, a ${s2.pl} ${b2.box.to}`;
    } else {
      const [c1, c2, c3] = sample(coloursOf(L), 3), one = (c) => ({ shape: pick(shapesOf(L)), colour: c, scale: 1 });
      g1 = times(k, () => one(c1)); g2 = times(k, () => one(c2)); if (L >= 6) extra = times(2, () => one(c3));
      text = `włóż ${adj(c1.id).pl} kształty ${b1.box.to}, a ${adj(c2.id).pl} ${b2.box.to}`;
    }
    g1.forEach((s) => { s.goes = b1; });
    g2.forEach((s) => { s.goes = b2; });
    const items = shuffle([...g1, ...g2, ...extra]);
    let land;
    return {
      text,
      build() {
        [b1, b2].forEach((b) => makeEl(b, 'it zone'));
        row([b1, b2], [0.12, 0.02, 0.76, 0.36]);
        scatter(items, [0, 0.42, 1, 0.58]);
        land = dragAndDrop(items, [b1, b2], (it, z) => {
          if (it.goes !== z) return false;
          Sound.ok(); Haptics.buzz('ok');
          let c = z.el.querySelector('.count');
          if (!c) { c = document.createElement('b'); c.className = 'count'; z.el.append(c); }
          c.textContent = (+c.textContent || 0) + 1;
          if (items.every((i) => !i.goes || i.gone || i === it)) setTimeout(finish, 350);
          return true;
        });
      },
      solve() { items.filter((i) => i.goes).forEach((i) => land(i, i.goes)); },
    };
  },

  // POŁĄCZ KOTA Z MYSZĄ · POŁĄCZ KOTA Z MYSZĄ, A PSA ZE SŁONIEM (linia palcem albo dotknij jednego, potem drugiego)
  connect(L) {
    const nPairs = L >= 5 && rand() < 0.6 ? 2 : 1;
    const set = sample(THINGS, nPairs * 2 + randInt(2, 3)).map((t) => ({ thing: t }));
    const pairs = range(0, nPairs - 1).map((i) => ({ a: set[2 * i], b: set[2 * i + 1] }));
    const NS = 'http://www.w3.org/2000/svg';
    let svg, link;
    const mid = (s) => [s.el.offsetLeft + s.el.offsetWidth / 2, s.el.offsetTop + s.el.offsetHeight / 2];
    const line = () => { const l = document.createElementNS(NS, 'line'); svg.append(l); return l; };
    const draw = (l, [x1, y1], [x2, y2]) => { l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); };
    return {
      text: 'połącz ' + pairs.map((p) => `${p.a.thing.acc} ${withZ(p.b.thing)}`).join(', a '),
      build() {
        svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'lines');
        stage.append(svg);
        scatter(shuffle(set.slice()));
        layouts.push(() => pairs.forEach((p) => p.line && draw(p.line, mid(p.a), mid(p.b))));
        link = (s1, s2) => {
          const p = pairs.find((q) => !q.done && ((q.a === s1 && q.b === s2) || (q.a === s2 && q.b === s1)));
          if (!p) { miss(s2.el); return; }
          p.done = true;
          p.line = line();
          p.line.classList.add('done');
          draw(p.line, mid(p.a), mid(p.b));
          s1.el.classList.add('linked'); s2.el.classList.add('linked');
          Sound.ok(); Haptics.buzz('ok');
          if (pairs.every((q) => q.done)) finish();
        };
        let from = null, live = null, id = null, moved = false, sx = 0, sy = 0;
        const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
        const at = (e) => set.find((s) => {
          const r = s.el.getBoundingClientRect(), p = r.width * 0.15;
          return e.clientX > r.left - p && e.clientX < r.right + p && e.clientY > r.top - p && e.clientY < r.bottom + p;
        });
        const unpick = () => { from?.el.classList.remove('picked'); from = null; };
        for (const s of set) {
          s.el.addEventListener('pointerdown', (e) => {
            if (task.done || id !== null) return;
            id = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
            try { s.el.setPointerCapture(id); } catch { /* starsze przeglądarki */ }
          });
          s.el.addEventListener('pointermove', (e) => {
            if (e.pointerId !== id) return;
            if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 10) return;
            if (!moved) { moved = true; unpick(); live = line(); }
            draw(live, mid(s), local(e));
          });
          const end = (e) => {
            if (e.pointerId !== id) return;
            id = null;
            if (live) { live.remove(); live = null; }
            if (task.done) return;
            if (moved) { const t = e.type === 'pointerup' && at(e); if (t && t !== s) link(s, t); return; }
            if (!from) { from = s; s.el.classList.add('picked'); Sound.tap(); } else if (from === s) unpick(); else { const f = from; unpick(); link(f, s); }
          };
          s.el.addEventListener('pointerup', end);
          s.el.addEventListener('pointercancel', end);
        }
      },
      solve() { pairs.forEach((p) => link(p.a, p.b)); },
    };
  },

  // DAJ BAŁWANOWI CZAPKĘ I SZALIK · DAJ MISIOWI OKULARY, BALON I BUTY
  dress(L) {
    const fig = pick(FIGURES), wear = WEAR.filter((w) => fig.slots[w.slot]);
    const k = L < 5 ? 2 : L < 6 ? randInt(2, 3) : 3;
    const want = sample([...new Set(wear.map((w) => w.slot))], k).map((slot) => pick(wear.filter((w) => w.slot === slot)));
    const tray = shuffle([...want, ...sample(wear.filter((w) => !want.includes(w)), L < 5 ? 2 : 3)]).map((w) => ({ thing: w, wear: w }));
    const figure = { thing: { emoji: '' }, html: fig.html };
    let land;
    return {
      text: `daj ${fig.dat} ${list(want.map((w) => w.acc))}`,
      build() {
        makeEl(figure, 'it zone figure');
        row([figure], [0.12, 0.02, 0.76, 0.68], 'middle', 330);
        row(tray, [0.02, 0.74, 0.96, 0.24]);
        const on = new Set();
        land = dragAndDrop(tray, [figure], (it) => {
          if (!want.includes(it.wear) || on.has(it.wear)) return false;
          on.add(it.wear);
          const [x, y, k2] = fig.slots[it.wear.slot];
          const sp = document.createElement('span');
          sp.className = 'worn';
          Object.assign(sp.style, { left: x + '%', top: y + '%', fontSize: `calc(var(--v) * ${k2})` });
          sp.textContent = it.wear.emoji;
          figure.el.append(sp);
          Sound.ok(); Haptics.buzz('ok');
          if (on.size === want.length) setTimeout(finish, 350);
          return true;
        });
      },
      solve() { tray.filter((t) => want.includes(t.wear)).forEach((t) => land(t, figure)); },
    };
  },

  // OLA MA KOTA. KOT JEST RUDY. KOGO MA OLA?
  story() {
    const st = pick(STORIES), num = /^\d$/.test(st.ok);
    let t;
    if (num) {
      const opts = shuffle([st.ok, ...st.wrong]).map((x) => ({ label: x, value: x, cls: 'num' }));
      t = answerTask(st.text, [{ thing: { emoji: '📖' } }], centre, opts, st.ok, 'nums');
    } else {
      const specs = shuffle([st.ok, ...st.wrong].map((e) => ({ thing: { emoji: e }, ok: e === st.ok })));
      t = selectTask(st.text, specs, (s) => s.ok, 1, (sp) => row(sp, [0.04, 0.2, 0.92, 0.6], 'middle', 150));
    }
    return Object.assign(t, { keep: true, long: true });
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
let levelTime = store.get('levelTime', 0), recent = store.get('recent', []);   // postęp na obecnym poziomie
if (params.get('level')) { levelTime = 0; recent = []; }
let results = [], hardRun = 0, bag = [], lastType = null, idleTimer = 0, nextTimer = 0;

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
  Object.assign(task, { type: ty, mistakes: 0, done: false, started: Date.now() });
  sentence.textContent = up(task.text);
  ask.classList.toggle('long', !!task.long);
  unveil();
  if (level >= HIDE_FROM && !task.keep) {
    const me = task;
    stage.addEventListener('pointerdown', () => { if (task === me && !me.done) veil(); }, { once: true });
  }
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
  tbx('task-end', { type: task.type, level, mistakes: task.mistakes, peeks: task.peeks || 0 });
  unveil();
  const up1 = adapt();
  cheer(up1);
  drawProgress();
  nextTimer = setTimeout(() => (results.length >= ROUND_TASKS ? endRound() : nextTask()), NEXT_DELAY);
}

// Poziom w górę po LEVEL_TIME sekundach gry na nim, jeśli ostatnie zadania szły dobrze (inaczej gra dalej na tym samym);
// w dół (bez ogłaszania) po kilku trudnych zadaniach z rzędu, i wtedy połowa czasu na niższym poziomie jest już zaliczona.
function adapt() {
  const m = task.mistakes;
  levelTime += Math.min((Date.now() - task.started) / 1000, TASK_TIME_CAP);
  recent = [...recent, m === 0 ? 1 : 0].slice(-LEVEL_WINDOW);
  hardRun = m >= HARD_MISTAKES ? hardRun + 1 : 0;
  const clean = recent.reduce((a, b) => a + b, 0) / LEVEL_WINDOW;
  let raised = false;
  if (level < MAX_LEVEL && levelTime >= LEVEL_TIME && recent.length >= LEVEL_WINDOW && clean >= LEVEL_UP_CLEAN) { setLevel(level + 1); raised = true; }
  else if (hardRun >= LEVEL_DOWN_AFTER && level > 1) setLevel(level - 1, LEVEL_TIME / 2);
  else saveLevel();
  return raised;
}
function setLevel(l, time = 0) {
  level = l; levelTime = time; recent = []; hardRun = 0;
  saveLevel();
}
function saveLevel() {
  store.set('level', level); store.set('levelTime', Math.round(levelTime)); store.set('recent', recent);
  drawLevel();
}

function cheer(raised) {
  const c = $('#cheer');
  c.innerHTML = `<span>${up(pick(CHEERS))}</span>${raised ? `<small>⭐ POZIOM ${level}</small>` : ''}`;
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
}

function startRound() {
  Sound.unlock();
  results = []; bag = []; hardRun = 0;
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
// Przycisk POZIOM napełnia się w miarę gry na poziomie (na ostatnim jest pełny).
function drawLevel() {
  const b = $('#level-btn'), p = level === MAX_LEVEL ? 100 : Math.min(100, levelTime / LEVEL_TIME * 100);
  b.textContent = `POZIOM ${level}`;
  b.style.setProperty('--p', p.toFixed(1) + '%');
}

/* ======== schowane polecenie 👁 (od HIDE_FROM) ======== */
// Na najwyższym poziomie polecenie trzeba zapamiętać: znika po pierwszym dotknięciu planszy, 👁 pokazuje je na chwilę.
const peekBtn = $('#peek');
let peekTimer = 0;
function veil() { ask.classList.add('veiled'); peekBtn.hidden = false; }
function unveil() { clearTimeout(peekTimer); ask.classList.remove('veiled'); peekBtn.hidden = true; }
peekBtn.addEventListener('click', () => {
  const me = task;
  unveil();
  me.peeks = (me.peeks || 0) + 1;
  peekTimer = setTimeout(() => { if (task === me && !me.done) veil(); }, PEEK_MS);
});

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
    b.addEventListener('click', () => { if (l !== level) setLevel(l); drawLevelPicker(); Sound.tap(); });
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
  setLevel(l, time = 0) { setLevel(l, time); },
  get levelTime() { return levelTime; },
  next: (type) => nextTask(type),
  solve: () => task && !task.done && task.solve(),
  gen: (type, L) => GEN[type](L).text,
  start: startRound,
};
