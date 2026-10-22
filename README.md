# claude-mods

Mod di Claude Code di Alessio Brunello.

Una mod è un plugin fatto di hook: una cartella con un manifest e un modulo che si aggancia agli eventi del motore. Può ridisegnare pezzi dell'interfaccia (la fascia sopra il prompt, un pannello, l'indicatore di lavoro), reagire alle chiamate dei tool, ai prompt e ai comandi.

## Mod disponibili

| Mod | Cosa fa |
| --- | --- |
| [status-band](status-band/) | Fascia sopra il prompt: ramo e stato git, esito delle review, modello, contesto, effort, limiti, costo e skill. Nell'app a tre schede con anelli, nel terminale a righe |
| [commit-graph](commit-graph/) | Il grafo dei commit del repository della chat in un pannello accanto alla conversazione, stile Git Graph: dettaglio di ogni commit sotto la riga e azioni affidate a Claude |

## Installare una mod

Scegli **una** delle due strade: con entrambe la mod si carica due volte.

### Dal marketplace

Il repository è anche un marketplace di plugin:

```bash
claude plugin marketplace add brunelloalessio-dev/claude-mods
```

```bash
claude plugin install status-band@claude-mods
```

Per aggiornare dopo una modifica al repository:

```bash
claude plugin marketplace update claude-mods
```

```bash
claude plugin update status-band@claude-mods
```

### Da cartella

Utile quando la mod si sta ancora modificando.

1. Copia la cartella della mod in `~/.claude/mods/` (su Windows `%USERPROFILE%\.claude\mods\`).
2. In `~/.claude/settings.json` aggiungi la variabile all'oggetto `env`:

   ```json
   {
     "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/status-band"
     }
   }
   ```

Dal terminale si può provare una mod senza toccare i settings:

```bash
claude --plugin-dir ./status-band
```

In ogni caso le mod si caricano all'avvio della sessione: quelle già aperte restano com'erano finché non le riavvii. Nell'app desktop serve chiuderla del tutto e riaprirla.

## Com'è fatta una mod

```text
nome-mod/
├── .claude-plugin/
│   └── plugin.json      nome, versione, descrizione, contratto dei tipi
├── hooks/
│   ├── hooks.json       { "modules": ["./register.tsx"] }
│   └── register.tsx     esporta register(on, options) e aggancia gli hook
├── types/
│   └── index.d.ts       solo se la mod tiene valori nello stato della sessione
└── tests/
    └── nome-mod.test.ts
```

## Aggiungere una mod

1. Crea la cartella con la struttura qui sopra. In una sessione di Claude Code conviene chiedere a Claude di scriverla: la skill `plugin-authoring` porta con sé l'API del motore e gli esempi, e la mod si ricarica a ogni modifica senza riavviare.
2. Aggiungi la voce in `.claude-plugin/marketplace.json`, con `name`, `source` e `description`.
3. Controlla manifest e test:

   ```bash
   claude plugin validate .
   ```

   ```bash
   claude plugin validate ./nome-mod
   ```

   ```bash
   claude plugin test ./nome-mod
   ```

4. Aggiungi una riga alla tabella delle mod in questo file e un `README.md` nella cartella della mod.

## Tipi per l'editor

I tipi del motore non stanno nel repository, perché cambiano a ogni versione di Claude Code. In una sessione aperta nella cartella della mod, il comando `/plugin-types` li scrive in `.claude/types/`, dove il `tsconfig.json` della mod li cerca.

## Crediti

`status-band` deriva da `fascia-gate` di Alessandro Pavan. `commit-graph` si ispira all'estensione Git Graph di mhutchie per VS Code.
