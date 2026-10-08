# status-band

Ridisegna la fascia sopra il prompt di Claude Code: ramo, stato git, esito delle review, modello, contesto, effort, limiti e skill. Deriva da `fascia-gate` di Alessandro Pavan.

## Cosa mostra

Nell'app desktop:

- **Riga del ramo**: il percorso attenuato e l'ultimo tratto in evidenza, così un nome lungo resta leggibile. A destra il contatore delle skill caricate, che apre l'elenco sotto il ramo, e la graffetta che copia l'ID della sessione.
- **Scheda «Stato git»**: file modificati, commit da pushare, commit indietro rispetto al ramo di partenza, stash, tempo dall'ultimo fetch. Sotto, l'ultimo verdetto di una review e l'avviso «codice da rivedere».
- **Scheda del modello**: il nome del modello fa da titolo, poi il contesto usato e l'effort, con le tacche che si animano mentre Claude lavora.
- **Scheda «Limiti»**: finestra delle 5 ore, settimana e costo della chat.

Nel terminale le stesse informazioni restano su righe di testo: lì non ci sono immagini.

## Installazione

Vedi il [README del repository](../README.md#installare-una-mod).

Se hai già accesa un'altra mod che disegna la fascia sopra il prompt (per esempio `fascia-gate`), spegnila: se la contendono.

## Adattarla al proprio repo

Le parti legate al repo per cui è nata stanno in testa a `hooks/register.tsx`:

| Costante | A cosa serve |
| --- | --- |
| `GATES` | I subagent di cui si legge il verdetto (riga `Verdetto:` nella risposta) |
| `CODE_GATES` | Quelli che contano come review del codice |
| `VERDICTS`, `BLOCKING`, `CLEAN_VERDICTS` | I verdetti riconosciuti, quelli in rosso e quelli in verde |
| `APP_CODE` | I file la cui modifica accende «codice da rivedere» |
| `BASES` | I rami di partenza ammessi: quello giusto si ricava dal secondo tratto del nome del ramo (`<motivo>/<alpha\|beta\|main>/...`) |

Su un repo senza questi agent e senza questa convenzione sui rami la fascia funziona lo stesso: le righe dei verdetti e il contatore «dietro» restano vuoti.

## File

- `.claude-plugin/plugin.json`: nome, versione e contratto dei tipi
- `hooks/register.tsx`: gli hook e il disegno della fascia
- `hooks/ring.ts`, `hooks/effort.ts`, `hooks/icons.ts`: le immagini SVG (anelli, tacche dell'effort, icone)
- `types/index.d.ts`: la forma dei valori che la mod tiene nello stato della sessione
- `tests/status-band.test.ts`: i test

Le immagini SVG non leggono il tema dell'app: i loro colori sono fissi, scelti per reggere sia il chiaro sia lo scuro.

## Limiti noti

- Scritta e provata con Claude Code 2.1.286 su Mac, tema scuro. Su Windows e col tema chiaro non è mai stata vista.
- L'elenco delle skill aperto con molte skill va a capo su più righe: non è stato provato quanto può crescere la fascia.
- Dentro una scheda vanno solo testi corti: un testo lungo allarga la scheda e spinge fuori le altre.
- I testi della fascia sono in italiano.
