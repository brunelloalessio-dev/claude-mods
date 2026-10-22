# status-band

Ridisegna la fascia sopra il prompt di Claude Code: ramo, stato git, worktree della chat, esito delle review, modello, contesto, effort, limiti e skill. Deriva da `fascia-gate` di Alessandro Pavan.

## Cosa mostra

Nell'app desktop:

- **Riga del ramo**: il percorso attenuato e l'ultimo tratto in evidenza, così un nome lungo resta leggibile. A destra il contatore delle skill caricate, che apre l'elenco sotto il ramo, e la graffetta che copia l'ID della sessione.
- **Worktree della chat**: accanto al ramo, in arancio, il worktree in cui sta lavorando la chat, col ramo da cui è partito (`da beta`). Con più worktree, per esempio mentre si riporta un fix su più ambienti, c'è un contatore (`3 worktree ▸`) che apre sopra le schede la scheda «Worktree»: per ciascuno il ramo di partenza, la cartella e l'ultimo tratto del ramo. Sono della chat i worktree che i suoi tool hanno nominato (un `cd`, un `git -C`, un file letto o scritto, `EnterWorktree`); quelli aperti da altre chat non compaiono. Il ramo di partenza è quello che git scrive alla creazione del ramo (`Created from origin/beta`), oppure, se il ramo è partito da un commit, l'ambiente nel suo nome. Senza worktree non compare nulla.
- **Scheda «Stato git»**: file modificati, commit da pushare, commit indietro rispetto al ramo di partenza, stash, tempo dall'ultimo fetch. Sotto, l'ultimo verdetto di una review e l'avviso «codice da rivedere».
- **Scheda del modello**: il nome del modello fa da titolo, poi il contesto usato e l'effort. Mentre Claude lavora le tacche si animano, più in fretta e più ampie a ogni livello; a low restano ferme. Ogni chat pesca a caso uno di 22 stili (gelatina, onda, pistoni, neon, supercar, radar e altri) e lo tiene fino alla fine, anche se la mod si ricarica.
- **Scheda «Limiti»**: finestra delle 5 ore, settimana e costo della chat.

Nel terminale le stesse informazioni restano su righe di testo: lì non ci sono immagini.

I colori sono quelli di Claude, presi dal design system dell'app desktop: l'arancio Claude per ciò che è in ordine e per ciò che fa Claude (anelli sotto il 50%, contatori a zero, verdetti puliti, worktree, skill di progetto, tacche dell'effort dall'arancio chiaro all'argilla, ultracode in un arancio più acceso), il giallo per gli avvisi, dal 50%, il rosso per i problemi, dall'80%, e grigi caldi per il resto.

## Installazione

Vedi il [README del repository](../README.md#installare-una-mod).

Se hai già accesa un'altra mod che disegna la fascia sopra il prompt (per esempio `fascia-gate`), spegnila: se la contendono.

## Adattarla al proprio repo

Le parti legate al repo per cui è nata stanno in testa a `hooks/register.tsx`:

| Costante | A cosa serve |
| --- | --- |
| `GATES` | I subagent di cui si legge il verdetto (riga `Verdetto:` nella risposta) |
| `CODE_GATES` | Quelli che contano come review del codice |
| `VERDICTS`, `BLOCKING`, `CLEAN_VERDICTS` | I verdetti riconosciuti, quelli in rosso e quelli puliti, in arancio |
| `APP_CODE` | I file la cui modifica accende «codice da rivedere» |
| `BASES` | I rami di partenza ammessi: quello giusto si ricava dal secondo tratto del nome del ramo (`<motivo>/<alpha\|beta\|main>/...`) |

Su un repo senza questi agent e senza questa convenzione sui rami la fascia funziona lo stesso: le righe dei verdetti e il contatore «dietro» restano vuoti.

## File

- `.claude-plugin/plugin.json`: nome, versione e contratto dei tipi
- `hooks/register.tsx`: gli hook e il disegno della fascia
- `hooks/palette.ts`: i colori, in un posto solo
- `hooks/ring.ts`, `hooks/effort.ts`, `hooks/icons.ts`: le immagini SVG (anelli, tacche dell'effort, icone)
- `hooks/effort-styles.ts`: gli stili dell'animazione dell'effort; per toglierne uno dal giro basta cancellarlo da `EFFORT_STYLES`. `hooks/effort-kit.ts` ha i pezzi che usano
- `types/index.d.ts`: la forma dei valori che la mod tiene nello stato della sessione
- `tests/status-band.test.ts`, `tests/effort.test.ts`: i test

Le immagini SVG non leggono il tema dell'app: i loro colori sono fissi, scelti per reggere sia il chiaro sia lo scuro. Per cambiarli basta `hooks/palette.ts`.

## Limiti noti

- Scritta e provata con Claude Code 2.1.286 su Mac, tema scuro. Su Windows e col tema chiaro non è mai stata vista.
- L'elenco delle skill aperto con molte skill va a capo su più righe: non è stato provato quanto può crescere la fascia.
- Dentro una scheda vanno solo testi corti: un testo lungo allarga la scheda e spinge fuori le altre.
- I testi della fascia sono in italiano.
