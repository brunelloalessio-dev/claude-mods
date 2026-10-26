import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput, RenderSurface, Timer } from 'claude-code'

import type { CommitDetail, Graph, GraphRow, Ref } from '../types'
import {
  checkoutPrompt,
  cherryPickPrompt,
  COMMIT_MESSAGE_PROMPT,
  explainPrompt,
  resetPrompt,
  revertPrompt,
  REVIEW_CHANGES_PROMPT,
  reviewPrompt,
  short,
} from './actions'
import { BUTTON_ROW_HEIGHT, gapSvg, geometry, ROW_HEIGHT, rowSvg } from './drawing'
import type { Geometry } from './drawing'
import { commitDetail, failedDetail, isHash, logArgs, parseLog, parseRefs, parseStatus, REFS_ARGS, uncommittedDetail } from './git'
import { layout, UNCOMMITTED } from './layout'

const PANE = 'commit-graph'
const TITLE = 'Grafo git'
const FIRST_LOAD = 300
const LOAD_MORE = 100
// Righe disegnate per volta: il pannello con trecento righe veniva scartato dall'app
const PAGE = 60
// Oltre questo il testo del pannello supererebbe quello che l'app disegna in una volta
const MAX_LOAD = 500
const MAX_BODY_LINES = 6
const MAX_FILES_SHOWN = 12
const MAX_LABELS = 2
// Una lettura che non risponde da tanto si considera persa: la successiva riparte invece di aspettarla
const STALE_MS = 60_000

// Dentro un evento lo stato si legge come era al suo inizio: `update`, che riprova finché la versione letta è quella
// vera, in una lettura lunga riprenderebbe all'infinito. Il lavoro in sottofondo scrive quindi con $.state.set, e
// con ifVersion solo dove non deve cancellare un clic della persona arrivato nel frattempo
const GRAPH = { plugin: 'commit-graph', key: 'graph' } as const
const PROBLEM = { plugin: 'commit-graph', key: 'problem' } as const
const BUSY = { plugin: 'commit-graph', key: 'busy' } as const
const SELECTED = { plugin: 'commit-graph', key: 'selected' } as const
const DETAIL = { plugin: 'commit-graph', key: 'detail' } as const

const graphState = atom(GRAPH, null as Graph | null)
const problemState = atom(PROBLEM, null as string | null)
const busyState = atom(BUSY, null as string | null)
const limitState = atom({ plugin: 'commit-graph', key: 'limit' } as const, FIRST_LOAD)
const drawnState = atom({ plugin: 'commit-graph', key: 'drawn' } as const, PAGE)
const remotesState = atom({ plugin: 'commit-graph', key: 'showRemotes' } as const, true)
const selectedState = atom(SELECTED, null as string | null)
const detailState = atom(DETAIL, null as CommitDetail | null)
const queryState = atom({ plugin: 'commit-graph', key: 'query' } as const, '')
const chatState = atom({ plugin: 'commit-graph', key: 'chatCommits' } as const, [] as string[])

const GIT_COMMAND = /\bgit\b/
// I comandi git che possono creare commit: quelli nati qui si segnano come «di questa chat»
const CREATES_COMMITS = /\bgit\b[^\n|;&]*\b(commit|merge|cherry-pick|revert|rebase|am)\b/

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Le funzioni che usano `$` stanno tutte in questo file: il motore lo segue solo dentro il modulo dei hook.
// --no-optional-locks: il pannello legge mentre Claude lavora, e non deve contendergli l'index.
// GIT_TERMINAL_PROMPT=0: senza terminale una richiesta di credenziali resterebbe appesa fino al timeout
async function git($: EngineInterface, root: string, args: string[], timeoutMs = 30_000): Promise<string> {
  const done = await $.process.run(['git', '--no-optional-locks', '-c', 'core.quotePath=false', ...args], {
    cwd: root,
    timeoutMs,
    env: { GIT_TERMINAL_PROMPT: '0' },
  })

  if (done.exitCode !== 0) {
    throw new Error(done.stderr.trim() || `git ${args[0] ?? ''} è uscito con ${done.exitCode}`)
  }

  return done.stdout
}

// git, ma un esito diverso da zero vale «niente»: un ramo staccato, un repository ancora senza commit
async function gitOrNull($: EngineInterface, root: string, args: string[]): Promise<string | null> {
  return git($, root, args).then(
    out => out.trim(),
    () => null,
  )
}

// Il ramo corrente letto adesso, non quello dell'ultimo aggiornamento: le richieste a Claude devono nominare quello vero
async function currentBranch($: EngineInterface, root: string): Promise<string | null> {
  const ref = await gitOrNull($, root, ['symbolic-ref', '--quiet', 'HEAD'])

  return ref?.startsWith('refs/heads/') === true ? ref.slice('refs/heads/'.length) : null
}

// I file di un commit rispetto al primo genitore: per un merge è quello che il merge ha portato nel ramo.
// Il primo commit si legge con git show, che sa confrontarlo col vuoto da sé
async function loadCommitDetail($: EngineInterface, graph: Graph, row: GraphRow): Promise<CommitDetail> {
  const parent = row.parents[0]

  if (parent === undefined && graph.isShallow) {
    return failedDetail(row.hash, 'Cronologia parziale: è il commit più vecchio di un clone superficiale, i suoi file non si possono confrontare')
  }

  const lists = (format: string) =>
    parent === undefined
      ? ['show', '--format=', format, '-z', '--no-renames', row.hash, '--']
      : ['diff', format, '-z', '--no-renames', parent, row.hash, '--']

  try {
    const [text, names, numstat] = await Promise.all([
      git($, graph.root, ['show', '-s', '--format=%B', row.hash, '--']),
      git($, graph.root, lists('--name-status')),
      git($, graph.root, lists('--numstat')),
    ])

    return commitDetail(row.hash, text, names, numstat)
  } catch (error) {
    return failedDetail(row.hash, error)
  }
}

async function loadUncommittedDetail($: EngineInterface, root: string): Promise<CommitDetail> {
  try {
    const [status, numstat] = await Promise.all([
      git($, root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
      git($, root, ['diff', '--numstat', '-z', '--no-renames', 'HEAD', '--']),
    ])

    return uncommittedDetail(UNCOMMITTED, status, numstat)
  } catch (error) {
    return failedDetail(UNCOMMITTED, error)
  }
}

// La richiesta finisce nel prompt e la manda la persona. Una bozza già scritta resta: la richiesta le va in coda
async function handToClaude($: EngineInterface, text: string): Promise<void> {
  const draft = await $.prompt.read().then(
    box => box.text,
    () => null,
  )
  const filled =
    draft !== null && draft.trim() === ''
      ? await $.prompt.fill({ text, mode: 'replace' })
      : await $.prompt.fill({ text: `\n\n${text}`, mode: 'append' })

  $.ui.toast(
    filled.isFilled
      ? 'Richiesta scritta nel prompt: controllala e inviala'
      : 'Non riesco a scrivere nel prompt: chiudi la finestra aperta e riprova',
  )
}

// Nell'app (e nell'editor) $.ui.copy non ha ancora un percorso: appunti di macOS con pbcopy, di Windows con clip
async function copyText($: EngineInterface, text: string, surface: RenderSurface): Promise<void> {
  let isCopied = false

  if (surface === 'desktop' || surface === 'vscode') {
    for (const tool of ['pbcopy', 'clip']) {
      isCopied = (await $.process.run([tool], { stdin: text }).catch(() => null))?.exitCode === 0

      if (isCopied) {
        break
      }
    }
  } else {
    isCopied = (await $.ui.copy({ text, surface })).isCopied
  }

  $.ui.toast(isCopied ? `Copiato: ${text}` : `Copia non riuscita: ${text}`)
}

function age(row: GraphRow, now: number): string {
  const elapsed = Math.max(0, now - row.time)

  if (elapsed < 60) {
    return 'ora'
  }

  if (elapsed < 3600) {
    // Corta e senza spazi: un'età che va a capo raddoppia l'altezza della riga e spezza le linee
    return `${Math.floor(elapsed / 60)}m`
  }

  if (elapsed < 86_400) {
    return `${Math.floor(elapsed / 3600)}h`
  }

  if (elapsed < 7 * 86_400) {
    return `${Math.floor(elapsed / 86_400)}g`
  }

  // Giorno e mese come li ha scritti git, nel fuso giusto per quel commit
  return (row.date ?? '').slice(0, 5)
}

// Del nome di un ramo conta l'ultimo tratto: il prefisso (features/alpha/progetto/) è quasi sempre lo stesso.
// Un remoto allineato a un ramo locale con lo stesso nome non si ripete
function labels(row: GraphRow): Ref[] {
  const locals = new Set(row.refs.filter(ref => ref.kind === 'head' || ref.kind === 'branch').map(ref => ref.name))

  return row.refs.filter(ref => ref.kind !== 'remote' || !locals.has(ref.name.slice(ref.name.indexOf('/') + 1)))
}

function labelText(ref: Ref): string {
  const last = ref.name.split('/').pop() ?? ref.name

  if (ref.kind === 'tag') {
    return `◆ ${last}`
  }

  return ref.kind === 'remote' ? `${ref.name.split('/')[0]}/${last}` : last
}

function matches(row: GraphRow, query: string): boolean {
  const needle = query.trim().toLowerCase()

  return (
    row.subject.toLowerCase().includes(needle) ||
    row.author.toLowerCase().includes(needle) ||
    row.hash.startsWith(needle) ||
    row.refs.some(ref => ref.name.toLowerCase().includes(needle))
  )
}

// Una lettura alla volta: chi chiede un aggiornamento mentre uno è in corso ne ottiene un altro subito dopo.
// Il passo in corso resta scritto, così una lettura che si pianta dice dove
let running: Promise<void> | null = null
let runningSince = 0
let step = ''
let isAgain = false

function refresh($: EngineInterface): Promise<void> {
  if (running !== null && Date.now() - runningSince < STALE_MS) {
    isAgain = true

    return running
  }

  if (running !== null) {
    void $.state.set(PROBLEM, `La lettura precedente non ha risposto (passo: ${step}): riprovo`)
  }

  runningSince = Date.now()
  running = (async () => {
    do {
      isAgain = false

      try {
        await load($)
      } catch (error) {
        await $.state.set(PROBLEM, `Non riesco a leggere il repository (passo: ${step}): ${message(error)}`)
      }
    } while (isAgain)
  })().finally(() => {
    running = null
  })

  return running
}

async function load($: EngineInterface): Promise<void> {
  step = 'cartella della chat'
  const cwd = await $.session.cwd()

  step = 'radice del repository'
  const root = await gitOrNull($, cwd, ['rev-parse', '--show-toplevel'])

  if (root === null) {
    await $.state.set(GRAPH, null)
    await $.state.set(PROBLEM, `La cartella della chat non è un repository git (${cwd})`)

    return
  }

  step = 'HEAD e ramo'
  const limit = Math.min(MAX_LOAD, await read($, limitState))
  const showRemotes = await read($, remotesState)
  const [head, branch, shallow, clock] = await Promise.all([
    gitOrNull($, root, ['rev-parse', '--verify', '--quiet', 'HEAD']),
    currentBranch($, root),
    gitOrNull($, root, ['rev-parse', '--is-shallow-repository']),
    $.process.run(['date', '+%H:%M']).then(
      done => done.stdout.trim(),
      () => '',
    ),
  ])

  step = 'commit, rami e modifiche'
  const [log, refs, status] = await Promise.all([
    git($, root, logArgs(limit, showRemotes, head !== null)),
    git($, root, REFS_ARGS),
    git($, root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
  ])

  step = 'disegno del grafo'
  const commits = parseLog(log)
  const changes = parseStatus(status).length
  const now = Math.floor((await $.clock.now()) / 1000)
  const shown = commits.slice(0, limit)
  const isHeadHidden = head !== null && !shown.some(commit => commit.hash === head)
  // Le modifiche si attaccano a HEAD solo se HEAD è fra i commit mostrati: altrimenti la linea non arriverebbe mai
  const list =
    changes > 0
      ? [
          {
            hash: UNCOMMITTED,
            parents: head !== null && !isHeadHidden ? [head] : [],
            author: '',
            time: now,
            date: '',
            subject: `Modifiche non committate (${changes})`,
          },
          ...shown,
        ]
      : shown
  const { rows, lanes } = layout(list, head, parseRefs(refs, branch))

  step = 'salvataggio'
  await $.state.set(GRAPH, {
    root,
    branch,
    head,
    rows,
    lanes,
    hasMore: commits.length > limit,
    isDirty: changes > 0,
    isHeadHidden,
    isShallow: shallow === 'true',
    updatedAt: now,
    updatedClock: clock,
  })
  await $.state.set(PROBLEM, null)

  // Una riga aperta che non c'è più (commit fatto, amend, reset) si chiude; ifVersion: un clic arrivato nel
  // frattempo su un'altra riga resta
  const selected = await $.state.get(SELECTED)
  const detailNow = await $.state.get(DETAIL)

  if (selected.value != null && !rows.some(row => row.hash === selected.value)) {
    const closed = await $.state.set(SELECTED, null, { ifVersion: selected.version })

    if (closed.isSet) {
      await $.state.set(DETAIL, null, { ifVersion: detailNow.version })
    }
  }

  // Le modifiche non committate cambiano a ogni giro: un dettaglio aperto su di loro si rilegge. Se nel frattempo
  // la persona apre un'altra riga, il suo clic azzera il dettaglio e questa scrittura non passa
  if (selected.value === UNCOMMITTED && changes > 0) {
    step = 'modifiche non committate'
    const detail = await loadUncommittedDetail($, root)

    await $.state.set(DETAIL, detail, { ifVersion: detailNow.version })
  }

  step = 'fatto'
}

// Un clic sulla riga già aperta la chiude; su un'altra la apre e ne carica il dettaglio
async function select($: EngineInterface, hash: string): Promise<void> {
  if ((await read($, selectedState)) === hash) {
    await $.state.set(SELECTED, null)

    return
  }

  await $.state.set(SELECTED, hash)
  // La versione di questo azzeramento: se nel frattempo si apre un'altra riga, il dettaglio di questa non si scrive
  const cleared = await $.state.set(DETAIL, null)

  const graph = await read($, graphState)
  const row = graph?.rows.find(one => one.hash === hash)

  if (graph === null || row === undefined) {
    return
  }

  const detail = row.kind === 3 ? await loadUncommittedDetail($, graph.root) : await loadCommitDetail($, graph, row)

  await $.state.set(DETAIL, detail, { ifVersion: cleared.version })
}

async function fetchAll($: EngineInterface): Promise<void> {
  const graph = await read($, graphState)

  // Un secondo clic mentre il fetch gira non ne lancia un altro
  if (graph === null || (await read($, busyState)) !== null) {
    return
  }

  await $.state.set(BUSY, 'Fetch in corso…')

  try {
    await git($, graph.root, ['fetch', '--all'], 120_000)
    $.ui.toast('Fetch completato')
  } catch (error) {
    $.ui.toast(`Fetch non riuscito: ${message(error)}`)
  } finally {
    await $.state.set(BUSY, null)
  }

  await refresh($)
}

// I commit nati da un comando di Claude: quelli fra la HEAD di prima e quella di dopo con data di commit recente.
// La data esclude i commit di altri arrivati con un avanzamento veloce, che sono vecchi
async function markChatCommits($: EngineInterface, root: string, before: string | null, startedAt: number) {
  const after = await gitOrNull($, root, ['rev-parse', '--verify', '--quiet', 'HEAD'])

  if (after === null || after === before || !isHash(after) || (before !== null && !isHash(before))) {
    return
  }

  const range = before === null ? after : `${before}..${after}`
  const listed = await gitOrNull($, root, ['log', '--max-count=50', '--format=%H %ct', range, '--'])
  const fresh = (listed ?? '')
    .split('\n')
    .map(line => line.split(' '))
    .filter(([hash = '', time]) => isHash(hash) && Number(time) >= startedAt - 5)
    .map(([hash = '']) => hash)

  if (fresh.length > 0) {
    await update($, chatState, list => [...new Set([...list, ...fresh])].slice(-500))
  }
}

// Il timer di un caricamento precedente della mod: se ne tiene uno solo
let ticker: Timer | null = null

// Il registro dei pannelli è del motore, non del modulo: vale anche dopo un ricaricamento della mod
async function isPaneOpen($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE)
}

// Col pannello chiuso git non si legge: la mod resta ferma finché la persona non lo apre
async function refreshIfOpen($: EngineInterface): Promise<void> {
  if (await isPaneOpen($)) {
    await refresh($)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    // Niente controllo su e.isInteractive: l'app desktop avvia la sessione da programma e lì vale false,
    // quindi il controllo spegneva la mod proprio dove serve.
    // Il pannello non si apre da solo: lo apre /grafo, quando la persona lo chiede
    await $.command.register({ name: 'grafo', description: 'Apre il grafo git del repository della chat' })
    void refreshIfOpen($)
    // Commit, fetch e cambi di ramo fatti fuori dalla chat arrivano comunque entro un minuto
    ticker?.cancel()
    ticker = $.clock.every(60_000, () => void refreshIfOpen($))

    return started
  })

  on('command.run', { command: 'grafo' }, async $ => {
    void refresh($)
    const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })

    return { text: opened.isPlaced ? 'Grafo git aperto.' : `Il grafo non si può mostrare qui: ${opened.reason}` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      void refreshIfOpen($)
    }

    return done
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = e.tool === 'Bash' ? e.command : ''

    if (!GIT_COMMAND.test(command)) {
      return next(e)
    }

    const root = (await read($, graphState))?.root ?? null
    const tracks = root !== null && CREATES_COMMITS.test(command)
    const before = tracks && root !== null ? await gitOrNull($, root, ['rev-parse', '--verify', '--quiet', 'HEAD']) : null
    const startedAt = Math.floor((await $.clock.now()) / 1000)
    const done = await next(e)

    if (tracks && root !== null && done.deny === undefined) {
      await markChatCommits($, root, before, startedAt).catch(() => undefined)
    }

    void refreshIfOpen($)

    return done
  })
    // La mod osserva e basta: se qualcosa qui si rompe, il comando di Claude va avanti com'era, mai due volte
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // Un disegno che si rompe dice perché, invece di lasciare il pannello vuoto
    try {
      return await drawPane($, e)
    } catch (error) {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text color="error">{`Il pannello non si disegna: ${message(error)}`}</Text>
        </Box>
      )
    }
  })
}

async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  {
    // Uno stato salvato da una versione precedente della mod, senza i campi nuovi, vale come «non ancora letto»
    const stored = await read($, graphState)
    const graph = stored !== null && typeof stored.updatedClock === 'string' && typeof stored.isShallow === 'boolean' ? stored : null
    const problem = await read($, problemState)
    const busy = await read($, busyState)
    const selected = await read($, selectedState)
    const detail = await read($, detailState)
    const query = await read($, queryState)
    const chat = new Set(await read($, chatState))
    const showRemotes = await read($, remotesState)
    const drawn = await read($, drawnState)

    const act =(work: () => Promise<unknown>) => () => {
      void work().catch(error => $.ui.toast(message(error)))
    }

    const updated = graph === null ? 'Leggo il repository…' : `Aggiornato alle ${graph.updatedClock}`
    const status = busy ?? problem ?? updated

    // Nel terminale e nell'app per il telefono niente Svg: un elenco semplice dei commit
    if (e.surface === 'terminal' || e.surface === 'mobile') {
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text dimColor>{status}</Text>
          {(graph?.rows ?? []).slice(0, 40).map(row => (
            <Text wrap="truncate-end" dimColor={row.kind === 0}>
              <Text color={row.kind === 1 || row.kind === 2 ? 'claude' : undefined}>{row.kind === 3 ? '○ ' : '● '}</Text>
              {row.subject}
            </Text>
          ))}
        </Box>
      )
    }

    const { Box, Text, Button, Input, Svg } = $.ui.resolve(e)
    const at: Geometry = geometry(graph?.lanes ?? 1)
    const now = graph?.updatedAt ?? 0
    const isSearching = query.trim() !== ''
    const root = graph?.root ?? ''

    // Una riga del dettaglio: accanto, le linee del grafo che proseguono fino alla riga dopo
    const line = (row: GraphRow, height: number, content: RenderElement) => (
      <Box flexDirection="row" alignItems="center">
        {isSearching ? (
          <Box width={2} />
        ) : (
          <Box flexShrink={0}>
            <Svg source={gapSvg(row, height, at)} alt="grafo" width={at.width} height={height} />
          </Box>
        )}
        <Box flexGrow={1} flexShrink={1} minWidth={0} paddingLeft={1}>
          {content}
        </Box>
      </Box>
    )

    const button = (key: string, label: string, work: () => Promise<unknown>, isClaude = false) => (
      <Button key={key} onPress={act(work)}>
        {isClaude ? <Text color="claude">{`✦ ${label}`}</Text> : <Text>{label}</Text>}
      </Button>
    )

    const buttons = (row: GraphRow, items: RenderElement[]) =>
      line(row, BUTTON_ROW_HEIGHT, <Box flexDirection="row" columnGap={1}>{items}</Box>)

    const detailLines = (row: GraphRow): RenderElement[] => {
      const lines: RenderElement[] = []
      const isUncommitted = row.kind === 3

      lines.push(line(row, ROW_HEIGHT, <Text bold wrap="truncate-end">{isUncommitted ? 'Modifiche non committate' : row.subject}</Text>))

      if (!isUncommitted) {
        for (const text of (detail?.hash === row.hash ? detail.body : []).slice(0, MAX_BODY_LINES)) {
          lines.push(line(row, ROW_HEIGHT, <Text dimColor wrap="truncate-end">{text}</Text>))
        }

        const parents = row.parents.map(short).join(' ')

        lines.push(
          line(
            row,
            ROW_HEIGHT,
            <Text dimColor wrap="truncate-end">
              {`${short(row.hash)} · ${row.author} · ${row.date}${parents === '' ? '' : ` · genitori ${parents}`}`}
            </Text>,
          ),
        )

        if (row.refs.length > 0) {
          lines.push(line(row, ROW_HEIGHT, <Text dimColor wrap="truncate-end">{`Rami e tag: ${row.refs.map(ref => ref.name).join(', ')}`}</Text>))
        }
      }

      if (detail === null || detail.hash !== row.hash) {
        lines.push(line(row, ROW_HEIGHT, <Text dimColor>Carico i file…</Text>))
      } else if (detail.error !== null) {
        lines.push(line(row, ROW_HEIGHT, <Text color="error" wrap="truncate-end">{detail.error}</Text>))
      } else {
        lines.push(line(row, ROW_HEIGHT, <Text dimColor>{`File cambiati: ${detail.total}`}</Text>))

        for (const file of detail.files.slice(0, MAX_FILES_SHOWN)) {
          const color = file.status === 'D' || file.status === '!' ? 'error' : file.status === 'A' || file.status === '?' ? 'success' : 'warning'

          lines.push(
            line(
              row,
              ROW_HEIGHT,
              <Box flexDirection="row" columnGap={1} minWidth={0}>
                <Text color={color}>{file.status}</Text>
                <Text color="success">{file.added === null ? '' : `+${file.added}`}</Text>
                <Text color="error">{file.removed === null ? '' : `−${file.removed}`}</Text>
                <Box flexShrink={1} minWidth={0}>
                  <Text wrap="truncate-start">{file.path}</Text>
                </Box>
              </Box>,
            ),
          )
        }

        if (detail.total > MAX_FILES_SHOWN) {
          lines.push(line(row, ROW_HEIGHT, <Text dimColor>{`e altri ${detail.total - MAX_FILES_SHOWN} file`}</Text>))
        }
      }

      if (isUncommitted) {
        lines.push(buttons(row, [button('messaggio', 'Scrivi il messaggio di commit', () => handToClaude($, COMMIT_MESSAGE_PROMPT), true)]))
        lines.push(buttons(row, [button('rivedi-modifiche', 'Rivedi le modifiche', () => handToClaude($, REVIEW_CHANGES_PROMPT), true)]))

        return lines
      }

      lines.push(
        buttons(row, [
          button('spiega', 'Spiega', () => handToClaude($, explainPrompt(row)), true),
          button('rivedi', 'Rivedi', () => handToClaude($, reviewPrompt(row)), true),
          <Button key="copia" onPress={press => void copyText($, row.hash, press.surface).catch(error => $.ui.toast(message(error)))}>
            Copia hash
          </Button>,
        ]),
      )
      lines.push(line(row, ROW_HEIGHT, <Text dimColor>Tramite Claude, con i suoi controlli:</Text>))

      // Sulla HEAD checkout, cherry-pick e reset non hanno senso: resta il revert.
      // Il ramo si rilegge al clic: dall'ultimo aggiornamento la chat può averlo cambiato
      const isHead = row.kind === 2
      const revert = button('revert', 'Revert', async () => handToClaude($, revertPrompt(row, await currentBranch($, root))))

      lines.push(
        buttons(
          row,
          isHead
            ? [revert]
            : [
                button('checkout', 'Checkout', () => handToClaude($, checkoutPrompt(row, graph?.isDirty ?? false))),
                button('cherry-pick', 'Cherry-pick', async () => handToClaude($, cherryPickPrompt(row, await currentBranch($, root)))),
              ],
        ),
      )

      if (!isHead) {
        lines.push(
          buttons(row, [revert, button('reset', 'Reset qui', async () => handToClaude($, resetPrompt(row, await currentBranch($, root))))]),
        )
      }

      return lines
    }

    const rowView = (row: GraphRow) => {
      const shown = labels(row)
      const parts: RenderElement[] = shown.slice(0, MAX_LABELS).map(ref => (
        <Text
          wrap="truncate-end"
          bold={ref.kind === 'head' || ref.kind === 'branch'}
          color={ref.kind === 'head' ? 'claude' : undefined}
          dimColor={ref.kind === 'remote' || ref.kind === 'tag'}
        >
          {`${labelText(ref)} `}
        </Text>
      ))

      if (shown.length > MAX_LABELS) {
        parts.push(<Text dimColor>{`+${shown.length - MAX_LABELS} `}</Text>)
      }

      if (chat.has(row.hash)) {
        parts.push(<Text color="claude">✦ </Text>)
      }

      parts.push(
        <Text wrap="truncate-end" dimColor={row.kind === 0 || row.kind === 3}>
          {row.subject}
        </Text>,
      )

      return (
        <Box flexDirection="row" alignItems="center">
          {isSearching ? (
            <Text dimColor>{`${short(row.hash)} `}</Text>
          ) : (
            // Senza flexShrink a zero l'app stringe il disegno per far posto al messaggio e le corsie si schiacciano
            <Box flexShrink={0}>
              <Svg source={rowSvg(row, at)} alt="grafo" width={at.width} height={ROW_HEIGHT} />
            </Box>
          )}
          <Box flexGrow={1} flexShrink={1} minWidth={0}>
            <Button key={`riga-${row.hash}`} plain onPress={act(() => select($, row.hash))}>
              {parts}
            </Button>
          </Box>
          {row.kind === 3 ? null : (
            <Box flexShrink={0} paddingLeft={1}>
              <Text dimColor wrap="truncate-end">
                {age(row, now)}
              </Text>
            </Box>
          )}
        </Box>
      )
    }

    const loaded = graph?.rows.filter(row => row.kind !== 3).length ?? 0
    const candidates = isSearching ? (graph?.rows ?? []).filter(row => row.kind !== 3 && matches(row, query)) : (graph?.rows ?? [])
    const visible = candidates.slice(0, drawn)
    const body: RenderElement[] = []

    for (const row of visible) {
      body.push(rowView(row))

      if (row.hash === selected) {
        body.push(...detailLines(row))
      }
    }

    // La ricerca guarda solo i commit caricati: il conteggio lo dice
    const summary = isSearching ? `${candidates.length} trovati fra gli ultimi ${loaded} commit · ${status}` : status
    const repoName = root.split('/').pop() ?? ''
    const canLoadMore = graph?.hasMore === true && loaded < MAX_LOAD

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="column" rowGap={1}>
          <Box flexDirection="row" columnGap={1} alignItems="center">
            <Text bold>{repoName}</Text>
            <Box flexShrink={1} minWidth={0}>
              <Text color="claude" wrap="truncate-start">
                {graph === null ? '' : (graph.branch ?? 'HEAD staccata')}
              </Text>
            </Box>
          </Box>
          <Box flexDirection="row" columnGap={1} alignItems="center">
            {button('aggiorna', 'Aggiorna', () => refresh($))}
            {button('fetch', 'Fetch', () => fetchAll($))}
            {button('remoti', showRemotes ? 'Nascondi remoti' : 'Mostra remoti', async () => {
              await update($, remotesState, value => !value)
              await refresh($)
            })}
          </Box>
          <Input
            key="cerca"
            placeholder="Cerca per messaggio, autore, hash o ramo"
            value={query}
            onInput={value => void update($, queryState, () => value)}
            onSubmit={value => void update($, queryState, () => value)}
          />
          <Text dimColor wrap="truncate-end">
            {summary}
          </Text>
          {graph?.isHeadHidden === true ? (
            <Text color="warning" wrap="truncate-end">
              HEAD è più indietro dei commit caricati: carica altri commit per vederla
            </Text>
          ) : null}
          {graph !== null && graph.rows.length === 0 ? <Text dimColor>Nessun commit ancora</Text> : null}
        </Box>
        <Box flexDirection="column">{body}</Box>
        {candidates.length > drawn ? (
          <Button key="mostra" plain onPress={act(() => update($, drawnState, count => count + PAGE))}>
            <Text dimColor>{`Mostra altri ${Math.min(PAGE, candidates.length - drawn)} commit`}</Text>
          </Button>
        ) : null}
        {candidates.length <= drawn && canLoadMore ? (
          <Button
            key="altri"
            plain
            onPress={act(async () => {
              await update($, limitState, limit => Math.min(MAX_LOAD, limit + LOAD_MORE))
              await update($, drawnState, count => count + PAGE)
              await refresh($)
            })}
          >
            <Text dimColor>{`Carica altri ${LOAD_MORE} commit`}</Text>
          </Button>
        ) : null}
        {candidates.length <= drawn && graph?.hasMore === true && !canLoadMore ? <Text dimColor>{`Mostro gli ultimi ${MAX_LOAD} commit`}</Text> : null}
      </Box>
    )
  }
}
