# commit-graph

Il grafo dei commit del repository su cui lavora la chat, in un pannello accanto alla conversazione, sul modello dell'estensione Git Graph di VS Code. Il pannello si apre solo quando lo chiedi, col comando `/grafo`; nell'app desktop si aggancia a destra della chat.

## Cosa mostra

- **Il grafo**: gli ultimi 300 commit di rami locali, remoti e tag, disegnati a righe da 60 con «Mostra altri» e «Carica altri 100 commit» (fino a 500). Le corsie sono grigie; la linea del ramo corrente, cioè HEAD e i suoi primi genitori, è arancio, con un anello sul commit di HEAD. Con tanti rami affiancati le corsie si stringono, perché il grafo non mangi il pannello.
- **Le modifiche non committate**: una riga in cima, legata a HEAD da una linea tratteggiata.
- **Le etichette**: rami locali, remoti (uno solo se allineato al ramo locale con lo stesso nome) e tag, col solo ultimo tratto del nome.
- **I commit della chat**: una scintilla ✦ sui commit creati dai comandi git di Claude in questa sessione.
- **L'età** di ogni commit (`34m`, `2h`, `3g`, oltre la settimana la data).

## Il dettaglio di un commit

Un clic sulla riga apre il dettaglio sotto di essa, con le linee del grafo che proseguono accanto; un secondo clic lo chiude. Dentro: messaggio intero, hash, autore, data, genitori, rami e tag, e i file cambiati rispetto al primo genitore con righe aggiunte e tolte.

Le azioni:

| Azione | Cosa fa |
| --- | --- |
| ✦ Spiega, ✦ Rivedi | Scrivono nel prompt una richiesta a Claude sul commit |
| Copia hash | Copia l'hash negli appunti |
| Checkout, Cherry-pick, Revert, Reset qui | Scrivono nel prompt la richiesta per Claude; la manda la persona |

Le azioni che cambiano il repository non le esegue la mod: un comando git lanciato da una mod non passa dai permessi né dagli hook di Claude Code, mentre una richiesta mandata a Claude sì. Sui rami protetti la richiesta chiede a Claude di domandare conferma prima di procedere. Sulla riga delle modifiche non committate le azioni sono «Scrivi il messaggio di commit» e «Rivedi le modifiche».

In alto ci sono «Aggiorna», «Fetch» (`git fetch --all`), «Nascondi remoti» e la ricerca per messaggio, autore, hash o ramo, che guarda i commit caricati.

## Quando si aggiorna

Mentre il pannello è aperto: a fine di ogni turno di Claude, dopo ogni comando git che Claude lancia, ogni minuto e col bottone «Aggiorna». Col pannello chiuso la mod non legge il repository. Segue la cartella della chat: se la chat passa a un worktree o a un altro repository, il grafo lo segue.

## Installazione

Al prompt di una sessione nel terminale:

```text
/plugin install commit-graph --marketplace brunelloalessio-dev/claude-mods
```

Da una shell:

```bash
claude plugin install commit-graph --marketplace brunelloalessio-dev/claude-mods
```

Nell'app desktop, dove `/plugin` non gira: il + accanto al prompt, poi Plugins, Add marketplace con `brunelloalessio-dev/claude-mods`, poi Add plugin. L'installazione da cartella e gli aggiornamenti sono nel [README del repository](../README.md#installare-una-mod).

## Adattarla

| Costante | Dove | A cosa serve |
| --- | --- | --- |
| `PROTECTED` | `hooks/actions.ts` | I rami su cui le richieste a Claude chiedono conferma (`main`, `master`, `beta`, `alpha`) |
| `FIRST_LOAD`, `LOAD_MORE`, `MAX_LOAD` | `hooks/register.tsx` | Quanti commit si leggono, quanti se ne aggiungono, il massimo |
| `PAGE` | `hooks/register.tsx` | Quante righe si disegnano per volta |
| `MAX_GRAPH` | `hooks/drawing.ts` | La larghezza massima del grafo, in pixel |

## Limiti noti

- Il grafo con le corsie si vede nell'app desktop; nel terminale resta un elenco semplice dei commit.
- Niente clic destro, doppio clic, Cmd+clic o trascinamento: l'interfaccia delle mod non li offre, quindi le azioni stanno nel dettaglio del commit.
- L'app scarta un pannello troppo grande: per questo le righe si disegnano a pagine.

## File

- `.claude-plugin/plugin.json`: nome, versione e contratto dei tipi
- `hooks/register.tsx`: gli hook, i comandi git e il disegno del pannello
- `hooks/layout.ts`: l'assegnazione delle corsie
- `hooks/git.ts`: gli argomenti dei comandi git e la lettura del loro output
- `hooks/drawing.ts`: il disegno di ogni riga del grafo
- `hooks/actions.ts`: i testi delle richieste a Claude
- `types/index.d.ts`: lo stato della mod
- `tests/`: le prove con `claude plugin test`
