# Czytam i robię

A Polish reading game for children around five. Each turn shows one short instruction in big capital letters,
and the child reads it and does what it says: tap, mark, count, paint, drag, or answer yes or no. Nothing is
read aloud unless the child gets stuck, so the reading is the game.

## How it plays

- A round is 10 instructions. Each one done earns a star at the top (a paler star if there were mistakes).
- A wrong tap just wiggles and is never punished. After the first mistake (or 25 seconds) a 🔊 button
  appears that reads the instruction aloud with the device's Polish voice.
- Each level lasts about five minutes of play. The POZIOM button fills up as the child plays; once it's full, the
  level goes up as soon as at least 6 of the last 8 instructions were done without a mistake (otherwise the child
  keeps practising on the same level). Only time spent on instructions counts, at most a minute per instruction,
  so breaks don't count, and the progress is remembered between visits. After three hard instructions in a row
  the level quietly goes down, with half of the lower level already filled. A parent can also pick the level (1–6)
  on the start screen or with the POZIOM button, which starts that level from empty.
- Twenty-seven kinds of instruction, unlocked level by level:

| From level | Instruction | Example |
| --- | --- | --- |
| 1 | Tap one picture | DOTKNIJ KOTA · POKAŻ MAŁE ZIELONE KOŁO · DOTKNIJ ZIELONEJ GWIAZDKI |
| 1 | Mark all that match | ZAZNACZ WSZYSTKIE ZIELONE KWADRATY · ZAZNACZ WSZYSTKO, CO JEST ŻÓŁTE |
| 1 | Pick the word for a picture | CO TO JEST? (KOT / KOC / KOŃ / KOZA) |
| 1 | Yes or no | CZY TO JEST ZIELONA GWIAZDKA? · CZY KROWA LATA? · CZY SĄ TU TRZY KOŁA? |
| 1 | Build the word from syllables | UŁÓŻ SŁOWO (🍓 + TRU · SKAW · KA, later with extra look-alike syllables) |
| 2 | Count | ILE JEST CZERWONYCH SERC? |
| 2 | Mark an exact number | ZAZNACZ DWIE NIEBIESKIE GWIAZDKI · ZAZNACZ PIĘĆ KÓŁ |
| 2 | Paint | POMALUJ KOŁO NA ZIELONO, A SERCE NA ŻÓŁTO · POMALUJ DWA KOŁA NA CZERWONO |
| 2 | Cross out or tick (✓ / ✗ tools) | PRZEKREŚL WSZYSTKIE PSY, A ZAZNACZ KOTY |
| 2 | Feelings | DOTKNIJ SMUTNEJ MINKI · ZAZNACZ WSZYSTKIE WESOŁE MINKI · ILE JEST ŚPIĄCYCH MINEK? |
| 3 | Categories | ZAZNACZ WSZYSTKIE ZWIERZĘTA · ZAZNACZ WSZYSTKO, CO LATA |
| 3 | Mark two kinds | ZAZNACZ WSZYSTKIE KOTY I PSY · ZAZNACZ CZERWONE KOŁA I NIEBIESKIE KWADRATY |
| 3 | Feed an animal (drag) | DAJ KOŚĆ PSU · DAJ SER MYSZY, A MIÓD MISIOWI |
| 3 | Tap in order | DOTKNIJ KOTA, A POTEM PSA · DOTKNIJ PO KOLEI: RYBY, PTAKA I KOTA |
| 3 | Biggest / smallest | DOTKNIJ NAJWIĘKSZEJ GWIAZDKI · POKAŻ NAJMNIEJSZE KOŁO |
| 3 | Which picture matches | ZNAJDŹ OBRAZEK: KOT JEST POD KRZESŁEM (cat on / under / next to / above the chair) |
| 3 | Put it where it says (drag) | POŁÓŻ PIŁKĘ POD KRZESŁEM · WŁÓŻ BUT DO PUDEŁKA |
| 3 | Make the number right, then GOTOWE | W KOSZU MAJĄ BYĆ TRZY JABŁKA · DOŁÓŻ DO KOSZA JEDNO · WYJMIJ Z KOSZA DWA |
| 3 | More or fewer | CZEGO JEST WIĘCEJ: KÓŁ CZY GWIAZDEK? (level 6 adds TYLE SAMO) |
| 3 | Connect with a line | POŁĄCZ KOTA Z MYSZĄ · POŁĄCZ PSA ZE SŁONIEM |
| 4 | Put into a container (drag) | WŁÓŻ DWA JABŁKA DO KOSZA |
| 4 | Position in a row | POKAŻ TRZECI BALON · DOTKNIJ DRUGIEJ RYBY |
| 4 | Which sentence matches | KTÓRE ZDANIE PASUJE? (KOT JEST W KOSZU / KOT JEST NAD KOSZEM / PIES JEST W KOSZU) |
| 4 | Sort into two places (drag) | WŁÓŻ OWOCE DO KOSZA, A POJAZDY DO PUDEŁKA · WŁÓŻ CZERWONE KSZTAŁTY DO KOSZA, A ZIELONE DO WIADRA |
| 4 | Dress the snowman or teddy (drag) | DAJ BAŁWANOWI CZAPKĘ, SZALIK I MIOTŁĘ |
| 5 | Above / below | DOTKNIJ TEGO, CO JEST POD KOTEM |
| 5 | "All except" | ZAZNACZ WSZYSTKIE KOŁA OPRÓCZ CZERWONYCH · ZAZNACZ WSZYSTKO, CO NIE JEST ZIELONE |
| 6 | Short story and a question | OLA MA KOTA. KOT JEST RUDY. KOGO MA OLA? |

- From level 5, "mark all" instructions work like a worksheet: taps mark and unmark quietly, and the child presses
  GOTOWE when they think they're done, so it can't be solved by tapping everything until it finishes.
- At level 6 the instruction blurs after the first tap on the board, so it has to be remembered; the 👁 button
  shows it again for a moment.
- Higher levels also mean more pictures, more colours (up to nine), sizes (DUŻY / MAŁY) and two-part sentences.
- Sentences are put together from word tables with proper Polish grammar (gender, cases, number agreement:
  DWA KOŁA, DWIE GWIAZDKI, PIĘĆ GWIAZDEK), so every round is different.
- Dragging works by drag, or by tapping the picture and then where it should go.
- Works on phones and tablets in both orientations, and offline once loaded (it can be added to the Home Screen).

## Running it

Serve the folder and open it in a browser:

```bash
python -m http.server 5240
```

Then go to http://localhost:5240/. Opening `index.html` straight from disk mostly works too.

## Tuning knobs

At the top of `game.js`:

| Knob | Default | What it does |
| --- | --- | --- |
| `ROUND_TASKS` | 10 | Instructions in one round |
| `LEVEL_TIME` | 300 s | Play time on a level before it can go up |
| `TASK_TIME_CAP` | 60 s | Most one instruction adds to that time, so breaks don't count |
| `LEVEL_WINDOW` | 8 | Recent instructions looked at before going up… |
| `LEVEL_UP_CLEAN` | 0.75 | …and the share of them that must be mistake-free |
| `LEVEL_DOWN_AFTER` | 3 | Hard instructions in a row before the level goes down |
| `HARD_MISTAKES` | 2 | Mistakes that make an instruction "hard" |
| `NEXT_DELAY` | 1300 ms | Pause after a finished instruction |
| `HINT_IDLE` | 25000 ms | Time before the 🔊 button appears without a mistake |
| `SHEET_FROM` | 5 | Level from which "mark all" is checked only when GOTOWE is pressed |
| `HIDE_FROM` | 6 | Level from which the instruction blurs after the first tap on the board |
| `PEEK_MS` | 2500 ms | How long 👁 shows a blurred instruction |
| `LEVELS` | | Per level: how many pictures, colours and shapes, and which kinds of instruction |

The words live in tables in `game.js` (`THINGS`, `WORDS`, `FACTS`, `COLOURS`, `SHAPES`, `PLACES`, `FEELINGS`,
`SYLLABLES`, `WEAR`, `STORIES`); each noun lists its forms (e.g. `kot|ma|kota|kota|koty|kotów|kotem|kotu|🐱|zw feed`), so new pictures can be added without code changes.

For testing, `?level=4&type=feed` starts at a level with only one kind of instruction, and `?tbxtest` keeps it silent.

## Credits

Font: [Lexend](https://fonts.google.com/specimen/Lexend) (SIL Open Font License), a wide typeface designed for
easy reading. Pictures are the device's own emoji; sounds are synthesized in the browser.
