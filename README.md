# Czytam i robię

A Polish reading game for children around five. Each turn shows one short instruction in big capital letters,
and the child reads it and does what it says: tap, mark, count, paint, drag, or answer yes or no. Nothing is
read aloud unless the child gets stuck, so the reading is the game.

## How it plays

- A round is 10 instructions. Each one done earns a star at the top (a paler star if there were mistakes).
- A wrong tap just wiggles and is never punished. After the first mistake (or 25 seconds) a 🔊 button
  appears that reads the instruction aloud with the device's Polish voice.
- The level goes up by itself after three instructions in a row without a mistake, and quietly goes down after
  two hard ones. A parent can also pick the level (1–6) on the start screen or with the POZIOM button.
- Fifteen kinds of instruction, unlocked level by level:

| From level | Instruction | Example |
| --- | --- | --- |
| 1 | Tap one picture | DOTKNIJ KOTA · POKAŻ MAŁE ZIELONE KOŁO |
| 1 | Mark all that match | ZAZNACZ WSZYSTKIE ZIELONE KWADRATY · ZAZNACZ WSZYSTKO, CO JEST ŻÓŁTE |
| 1 | Pick the word for a picture | CO TO JEST? (KOT / KOC / KOŃ / KOZA) |
| 1 | Yes or no | CZY TO JEST ZIELONA GWIAZDKA? · CZY KROWA LATA? · CZY SĄ TU TRZY KOŁA? |
| 2 | Count | ILE JEST CZERWONYCH SERC? |
| 2 | Mark an exact number | ZAZNACZ DWIE NIEBIESKIE GWIAZDKI · ZAZNACZ PIĘĆ KÓŁ |
| 2 | Paint | POMALUJ KOŁO NA ZIELONO, A SERCE NA ŻÓŁTO |
| 3 | Categories | ZAZNACZ WSZYSTKIE ZWIERZĘTA · ZAZNACZ WSZYSTKO, CO LATA |
| 3 | Feed an animal (drag) | DAJ KOŚĆ PSU · DAJ SER MYSZY, A MIÓD MISIOWI |
| 3 | Tap in order | DOTKNIJ KOTA, A POTEM PSA · DOTKNIJ PO KOLEI: RYBĘ, PTAKA I KOTA |
| 3 | Biggest / smallest | DOTKNIJ NAJWIĘKSZĄ GWIAZDKĘ |
| 4 | Put into a container (drag) | WŁÓŻ DWA JABŁKA DO KOSZA |
| 4 | Position in a row | DOTKNIJ TRZECI BALON · DOTKNIJ DRUGĄ RYBĘ |
| 5 | Above / below | DOTKNIJ TO, CO JEST POD KOTEM |
| 5 | "All except" | ZAZNACZ WSZYSTKIE KOŁA OPRÓCZ CZERWONYCH · ZAZNACZ WSZYSTKO, CO NIE JEST ZIELONE |

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
| `LEVEL_UP_AFTER` | 3 | Instructions in a row without a mistake before the level goes up |
| `LEVEL_DOWN_AFTER` | 2 | Hard instructions in a row before the level goes down |
| `HARD_MISTAKES` | 2 | Mistakes that make an instruction "hard" |
| `NEXT_DELAY` | 1300 ms | Pause after a finished instruction |
| `HINT_IDLE` | 25000 ms | Time before the 🔊 button appears without a mistake |
| `LEVELS` | | Per level: how many pictures, colours and shapes, and which kinds of instruction |

The words live in tables in `game.js` (`THINGS`, `WORDS`, `FACTS`, `COLOURS`, `SHAPES`); each noun lists its
forms (e.g. `kot|ma|kota|koty|kotów|kotem|kotu|🐱|zw feed`), so new pictures can be added without code changes.

For testing, `?level=4&type=feed` starts at a level with only one kind of instruction, and `?tbxtest` keeps it silent.

## Credits

Font: [Lexend](https://fonts.google.com/specimen/Lexend) (SIL Open Font License), a wide typeface designed for
easy reading. Pictures are the device's own emoji; sounds are synthesized in the browser.
