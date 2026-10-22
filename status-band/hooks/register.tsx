import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface, SessionUsage } from 'claude-code'

import type { ChatWorktree, ContextFill, GateReport, GitStatus, RepoWorktree, UsageLimit } from '../types'

import { effortSvg, pickEffortStyle, randomUnit } from './effort'
import { BRANCH_ICON, SKILL_ICON, SPACER, WORKTREE_ICON } from './icons'
import { ringSvg } from './ring'

// I subagent di review del repo: da adattare al proprio. I secondi sono quelli che coprono le modifiche al codice
const GATES = ['supervisor', 'reviewer-rossella', 'critic']
const CODE_GATES = ['reviewer-rossella', 'critic']

// Verdetti degli agent, dalla riga «Verdetto: …»; i bloccanti sono quelli che fermano il lavoro
const VERDICTS = ['DA CORREGGERE', 'DA RIVEDERE', 'APPROVATO', 'RIFIUTATO', 'BLOCCATO']
const BLOCKING = ['RIFIUTATO', 'BLOCCATO']
// Codice applicativo del monorepo: quello che la review deve vedere
const APP_CODE = /(^|[\\/])(apps|packages)[\\/].+\.(ts|tsx)$/i

const WINDOWS = [
  ['five_hour', '5h'],
  ['seven_day', 'Settimana'],
] as const
const DAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

// Le tacche come il selettore dell'app: cinque livelli dall'azzurro al blu, poi l'ultracode in viola
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_COLORS = ['#7cc8ff', '#5aafff', '#3d95ff', '#2f78f5', '#2d5be3']
const ULTRACODE_COLOR = '#a970ff'
const EFFORT_CELLS = EFFORTS.length + 1

// Le celle delle barre come statuspane
const BAR_CELLS = 8

// Le etichette delle skill: del progetto (.claude/skills) in azzurro, di plugin e integrate in grigio
const REPO_CHIP = { backgroundColor: '#1f3b5c', color: '#a8d4ff' }
const OTHER_CHIP = { backgroundColor: '#383838', color: '#bdbdbd' }
const PREFIX_COLOR = '#8a8a8a'
// Nell'app l'elenco delle skill e' una riga senza sfondo: l'azzurro di quelle di progetto deve reggere chiaro e scuro
const REPO_SKILL_COLOR = '#3d95ff'

// Verdetti puliti: ✓ in verde; gli altri non bloccanti ⚠ in giallo, i bloccanti ✗ in rosso
const CLEAN_VERDICTS = ['APPROVATO']

const branch = atom({ plugin: 'status-band', key: 'branch' } as const, null)
const worktree = atom({ plugin: 'status-band', key: 'worktree' } as const, null)
const git = atom({ plugin: 'status-band', key: 'git' } as const, null)
const report = atom({ plugin: 'status-band', key: 'report' } as const, null)
const running = atom({ plugin: 'status-band', key: 'running' } as const, {})
const gateTypes = atom({ plugin: 'status-band', key: 'gateTypes' } as const, {})
const rounds = atom({ plugin: 'status-band', key: 'rounds' } as const, {})
const isCodeUnreviewed = atom({ plugin: 'status-band', key: 'isCodeUnreviewed' } as const, false)
const limits = atom({ plugin: 'status-band', key: 'limits' } as const, [])
const chatUsd = atom({ plugin: 'status-band', key: 'chatUsd' } as const, null)
const context = atom({ plugin: 'status-band', key: 'context' } as const, null)
const model = atom({ plugin: 'status-band', key: 'model' } as const, null)
const effort = atom({ plugin: 'status-band', key: 'effort' } as const, null)
const effortStyle = atom({ plugin: 'status-band', key: 'effortStyle' } as const, null)
const isUltracode = atom({ plugin: 'status-band', key: 'isUltracode' } as const, false)
const offsetMinutes = atom({ plugin: 'status-band', key: 'offsetMinutes' } as const, null)
const now = atom({ plugin: 'status-band', key: 'now' } as const, 0)
const skills = atom({ plugin: 'status-band', key: 'skills' } as const, [])
const recentSkills = atom({ plugin: 'status-band', key: 'recentSkills' } as const, [])
const repoSkills = atom({ plugin: 'status-band', key: 'repoSkills' } as const, [])
const conversation = atom({ plugin: 'status-band', key: 'conversation' } as const, null)
const isSkillsOpen = atom({ plugin: 'status-band', key: 'isSkillsOpen' } as const, false)
const repoWorktrees = atom({ plugin: 'status-band', key: 'repoWorktrees' } as const, [])
const chatWorktreePaths = atom({ plugin: 'status-band', key: 'chatWorktreePaths' } as const, null)
const worktrees = atom({ plugin: 'status-band', key: 'worktrees' } as const, [])
const isWorktreesOpen = atom({ plugin: 'status-band', key: 'isWorktreesOpen' } as const, false)

// I rami di ambiente da cui partono i nostri: stanno al secondo posto nel nome (<motivo>/<ambiente>/...)
const BASES = ['alpha', 'beta', 'main']

// Ordine del primo caricamento, senza doppioni; a parte quelle del turno in corso e quelle del repo
async function addSkills($: EngineInterface, names: readonly string[], isRecent: boolean) {
  await update($, skills, list => [...new Set([...list, ...names])])

  if (isRecent) {
    await update($, recentSkills, list => [...new Set([...list, ...names])])
  }

  const root = await $.session.root()
  const known = await read($, repoSkills)
  const found: string[] = []

  for (const name of new Set(names)) {
    if (name.includes(':') || known.includes(name)) {
      continue
    }

    // Le skill di progetto stanno in .claude/skills; i comandi del repo accanto, oppure un livello sopra la cartella di lavoro
    const paths = [
      `${root}/.claude/skills/${name}/SKILL.md`,
      `${root}/.claude/commands/${name}.md`,
      `${root}/../.claude/commands/${name}.md`,
    ]

    for (const path of paths) {
      if (await $.fs.exists(path).catch(() => false)) {
        found.push(name)
        break
      }
    }
  }

  if (found.length > 0) {
    await update($, repoSkills, list => [...new Set([...list, ...found])])
  }
}

// Una conversazione finita (/clear, ripresa di un'altra) non lascia le sue skill alla successiva
async function clearSkills($: EngineInterface) {
  await update($, skills, () => [])
  await update($, recentSkills, () => [])
  await update($, isSkillsOpen, () => false)
  await update($, conversation, () => null)
}

// Le skill della conversazione corrente da capo, dalle chiamate al tool Skill gia' nei messaggi;
// quelle da /nome o precaricate nei subagent non lasciano tracce li' e si vedono solo da quando la mod gira
async function reloadSkills($: EngineInterface) {
  await clearSkills($)

  const id = await $.session.id()
  const rows = await $.session.messages()
  const loaded = rows
    .flatMap(row => row.toolUses)
    .filter(use => use.tool === 'Skill' && use.isError !== true && typeof use.input.skill === 'string')
    .map(use => String(use.input.skill))

  await update($, conversation, () => id)
  await addSkills($, loaded, false)
}

// L'ID con cui un'altra sessione manda messaggi a questa: nell'app quello local_… (list_sessions, SendMessage),
// nel terminale quello del transcript. Nell'app $.ui.copy non ha ancora un percorso: appunti di macOS con
// pbcopy, di Windows con clip
async function copySessionId($: EngineInterface, surface: RenderSurface) {
  const id = (await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')) ?? (await $.session.id())
  let isCopied = false

  if (surface === 'desktop') {
    for (const tool of ['pbcopy', 'clip']) {
      isCopied = (await $.process.run([tool], { stdin: id }).catch(() => null))?.exitCode === 0

      if (isCopied) {
        break
      }
    }
  } else {
    isCopied = (await $.ui.copy({ text: id, surface })).isCopied
  }

  $.ui.toast(isCopied ? `ID sessione copiato: ${id}` : `Copia non riuscita, ID sessione: ${id}`)
}

// Branch, worktree e lavoro non salvato; --no-optional-locks per non contendere l'index ai git della sessione
async function refreshGit($: EngineInterface) {
  const status = await $.process.run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'])

  if (status.exitCode !== 0) {
    await update($, branch, () => null)
    await update($, worktree, () => null)
    await update($, git, () => null)
    await update($, repoWorktrees, () => [])
    await update($, worktrees, () => [])

    return
  }

  const lines = status.stdout.split('\n')
  const head = /^# branch\.head (.+)$/m.exec(status.stdout)?.[1]?.trim() ?? '(detached)'
  const ab = /^# branch\.ab \+(\d+) -\d+$/m.exec(status.stdout)?.[1]
  let ahead = ab === undefined ? null : Number(ab)
  let isOnRemote = ab !== undefined

  // Senza upstream (qui i branch nascono --no-track) si confronta con origin/<branch>
  if (ab === undefined && head !== '(detached)') {
    const unpushed = await $.process.run(['git', 'rev-list', '--count', `refs/remotes/origin/${head}..HEAD`])
    isOnRemote = unpushed.exitCode === 0
    ahead = isOnRemote ? Number(unpushed.stdout.trim()) : null
  }

  // Un worktree collegato ha una git-dir sua, diversa da quella comune del clone
  const paths = await $.process.run([
    'git',
    'rev-parse',
    '--path-format=absolute',
    '--show-toplevel',
    '--git-dir',
    '--git-common-dir',
  ])
  const [top = '', dir, common] = paths.stdout.split('\n').map(line => line.trim())
  const folder = paths.exitCode === 0 && dir !== common ? top.split(/[\\/]/).pop() || null : null

  // Quanti commit il ramo di partenza ha in piu' del nostro, contati sull'ultimo fetch: la mod non va in rete
  const origin = head.split('/')[1]
  const base = origin !== undefined && BASES.includes(origin) ? origin : null
  let behind: number | null = null

  if (base !== null) {
    const missing = await $.process.run(['git', 'rev-list', '--count', `HEAD..refs/remotes/origin/${base}`])
    behind = missing.exitCode === 0 ? Number(missing.stdout.trim()) : null
  }

  const stash = await $.process.run(['git', 'stash', 'list'])
  // L'ultimo fetch e' la data di FETCH_HEAD: in un worktree sta nella sua git-dir, altrimenti in quella comune
  let fetchedAt: number | null = null

  for (const gitDir of [dir, common]) {
    if (gitDir !== undefined && fetchedAt === null) {
      fetchedAt = (await $.fs.stat(`${gitDir}/FETCH_HEAD`).catch(() => null))?.mtimeMs ?? null
    }
  }

  const state: GitStatus = {
    changed: lines.filter(line => /^[12u] /.test(line)).length,
    untracked: lines.filter(line => line.startsWith('? ')).length,
    ahead,
    isOnRemote,
    base,
    behind,
    stashes: stash.exitCode === 0 ? stash.stdout.split('\n').filter(line => line.trim() !== '').length : 0,
    fetchedAt,
  }

  await update($, branch, () => head)
  await update($, worktree, () => folder)
  await update($, git, () => state)
  await refreshWorktrees($, top)
}

// I worktree del clone come li elenca git: il primo e' il checkout principale; un «prunable» ha perso la cartella
function parseWorktrees(stdout: string) {
  return stdout
    .split(/\n\s*\n/)
    .map(block => ({
      path: /^worktree (.+)$/m.exec(block)?.[1]?.trim() ?? '',
      branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim() ?? null,
      isPrunable: /^prunable\b/m.test(block),
    }))
    .filter(found => found.path !== '')
}

// I worktree in cui questa chat puo' lavorare: tutti tranne il checkout principale e quello della sessione
async function refreshWorktrees($: EngineInterface, top?: string) {
  const current =
    top ??
    (await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--show-toplevel'])).stdout.trim()
  const list = await $.process.run(['git', 'worktree', 'list', '--porcelain'])
  const [main, ...linked] = list.exitCode === 0 ? parseWorktrees(list.stdout) : []
  const others: RepoWorktree[] = linked
    .filter(found => !found.isPrunable && found.path !== current)
    .map(found => ({
      path: found.path,
      relative:
        main !== undefined && found.path.startsWith(`${main.path}/`) ? found.path.slice(main.path.length + 1) : null,
      branch: found.branch,
    }))

  await update($, repoWorktrees, () => others)
  await showChatWorktrees($)
}

// Da dove e' partito il ramo di un worktree: il ref che git scrive alla creazione («branch: Created from
// origin/beta»), ridotto all'ultimo tratto; se e' partito da un commit o da HEAD, l'ambiente nel nome del ramo
async function worktreeBase($: EngineInterface, name: string | null) {
  if (name === null) {
    return null
  }

  const log = await $.process.run(['git', 'reflog', 'show', '--format=%gs', `refs/heads/${name}`, '--'])
  const created = log.exitCode === 0 ? /^branch: Created from (.+)$/m.exec(log.stdout)?.[1]?.trim() : undefined

  if (created !== undefined && created !== 'HEAD' && !/^[0-9a-f]{7,40}$/i.test(created)) {
    return created.split('/').pop() ?? null
  }

  const origin = name.split('/')[1]

  return origin !== undefined && BASES.includes(origin) ? origin : null
}

// I percorsi dei worktree nominati da questa conversazione; quelli di una conversazione finita non valgono piu'
async function chatPaths($: EngineInterface) {
  const stored = await read($, chatWorktreePaths)

  return stored !== null && stored.conversation === (await $.session.id()) ? stored.paths : []
}

// Un percorso nominato nel testo per intero, non come inizio o fine di un altro (wt e wt-2)
function names(text: string, needle: string) {
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    if (!/[\w-]/.test(text.charAt(at - 1)) && !/[\w.-]/.test(text.charAt(at + needle.length))) {
      return true
    }
  }

  return false
}

// I worktree che un testo nomina, per percorso assoluto o relativo alla radice del clone (cd .claude/worktrees/x).
// Un relativo senza barre (una cartella in radice) sarebbe una parola qualsiasi: vale solo l'assoluto
function namedWorktrees(text: string, others: readonly RepoWorktree[]) {
  const plain = text.replace(/\\\\/g, '/')

  return others
    .filter(
      found => names(plain, found.path) || (found.relative?.includes('/') === true && names(plain, found.relative)),
    )
    .map(found => found.path)
}

// I worktree di questa chat nell'ordine in cui li ha nominati, come li disegna la fascia
async function showChatWorktrees($: EngineInterface) {
  const others = await read($, repoWorktrees)
  const shown: ChatWorktree[] = []

  for (const path of await chatPaths($)) {
    const found = others.find(other => other.path === path)

    if (found !== undefined) {
      shown.push({
        folder: found.path.split(/[\\/]/).pop() ?? found.path,
        branch: found.branch,
        base: await worktreeBase($, found.branch),
      })
    }
  }

  await update($, worktrees, () => shown)
}

// Aggiunge i worktree nominati ai worktree di questa chat; dice se ce n'erano di nuovi
async function addChatWorktrees($: EngineInterface, paths: readonly string[]) {
  const id = await $.session.id()
  const known = await chatPaths($)
  const added = paths.filter(path => !known.includes(path))

  if (added.length > 0) {
    await update($, chatWorktreePaths, () => ({ conversation: id, paths: [...new Set([...known, ...added])] }))
  }

  return added.length > 0
}

// I worktree gia' nominati dai tool di questa conversazione: dopo un reload della mod o una ripresa. I messaggi
// portano solo i tool del loop principale; quelli dei subagent si vedono solo da quando la mod gira
async function rescanChatWorktrees($: EngineInterface) {
  const others = await read($, repoWorktrees)
  const rows = await $.session.messages()
  const found = rows
    .flatMap(row => row.toolUses)
    .flatMap(use => namedWorktrees(JSON.stringify(use.input), others))

  await addChatWorktrees($, found)
  await showChatWorktrees($)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Fuso dell'host in minuti: l'ambiente della mod non lo conosce, git lo riporta con l'istante corrente
async function hostOffset($: EngineInterface) {
  const { exitCode, stdout } = await $.process.run(['git', 'var', 'GIT_COMMITTER_IDENT'])
  const match = / ([+-])(\d\d)(\d\d)\s*$/.exec(stdout)

  if (exitCode !== 0 || match === null) {
    return null
  }

  const [, sign, hours, minutes] = match

  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes))
}

// L'ultracode e' un'impostazione di sessione (l'app la passa come flag), indipendente dall'effort
async function refreshUltracode($: EngineInterface) {
  const { ultracode } = await $.settings.read()
  const isOn = ultracode === true

  if ((await read($, isUltracode)) !== isOn) {
    await update($, isUltracode, () => isOn)
  }
}

async function tick($: EngineInterface) {
  const t = await $.clock.now()
  await update($, now, () => t)
}

async function measure($: EngineInterface, usage: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>) {
  const windows: UsageLimit[] = usage.rateLimits.map(l => ({
    kind: l.kind,
    percentUsed: l.percentUsed,
    resetsAt: l.resetsAt ?? null,
  }))
  const fill: ContextFill = {
    tokens: usage.context.tokens ?? null,
    window: usage.context.window,
    percent: usage.context.percent ?? null,
  }

  await update($, limits, () => windows)
  await update($, chatUsd, () => usage.cost?.usd ?? null)
  await update($, context, () => fill)
  await tick($)
}

const pad = (n: number) => String(n).padStart(2, '0')

// L'ora locale: i campi UTC di un istante spostato del fuso dell'host
const shifted = (ms: number, offset: number) => new Date(ms + offset * 60_000)

function clock(ms: number, offset: number) {
  const d = shifted(ms, offset)

  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function until(ms: number) {
  const total = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60

  return days > 0 ? `${days}g${hours}h` : hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`
}

// Da quanto tempo: adesso, 12 min fa, 2 ore fa, 3 giorni fa
function ago(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) {
    return 'adesso'
  }

  if (hours < 1) {
    return `${minutes} min fa`
  }

  if (days < 1) {
    return hours === 1 ? '1 ora fa' : `${hours} ore fa`
  }

  return days === 1 ? '1 giorno fa' : `${days} giorni fa`
}

// Entro un giorno quanto manca (↻2h41m), oltre il giorno del rinnovo (↻ven 9/10)
function renewal(ms: number, nowMs: number, offset: number | null) {
  if (ms - nowMs < 86_400_000 || offset === null) {
    return `↻${until(ms - nowMs)}`
  }

  const d = shifted(ms, offset)

  return `↻${DAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

// $1.234,56 come nella fascia di riferimento
function dollars(value: number) {
  const [whole = '0', cents = '00'] = value.toFixed(2).split('.')

  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`
}

// 420k, 1M, 1,5M
function tokens(n: number) {
  if (n >= 1_000_000) {
    const millions = n / 1_000_000

    return `${Number.isInteger(millions) ? millions : millions.toFixed(1).replace('.', ',')}M`
  }

  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

// claude-opus-5-5[1m] -> Opus 5.5, claude-3-5-sonnet-20241022 -> Sonnet 3.5; un nome che non riconosce resta com'e'
function modelLabel(id: string) {
  const old = /(\d)-(\d)-(opus|sonnet|haiku)/i.exec(id)

  if (old !== null) {
    const [, major, minor, family = ''] = old

    return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}.${minor}`
  }

  // Le versioni hanno una o due cifre: una data (20250514) non e' una versione
  const match = /(opus|sonnet|haiku|fable)(?:[-\s]?(\d{1,2})(?!\d)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(id)

  if (match === null) {
    return id
  }

  const [, family = '', major, minor] = match
  const version = major === undefined ? '' : minor === undefined ? ` ${major}` : ` ${major}.${minor}`

  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()}${version}`
}

const percentColor = (p: number) => (p >= 80 ? 'error' : p >= 50 ? 'warning' : 'success')

// Celle piene e vuote di una barra: la traccia vuota ha lo stesso segno, attenuato
function cells(percent: number) {
  const full = Math.min(BAR_CELLS, Math.max(0, Math.round((percent / 100) * BAR_CELLS)))

  return ['▰'.repeat(full), '▰'.repeat(BAR_CELLS - full)] as const
}

// Tacche accese e spente e il colore del livello per i livelli con nome; un effort numerico non ha tacche
function effortCells(value: string | number) {
  const rank = typeof value === 'string' ? EFFORTS.indexOf(value) + 1 : 0

  return rank === 0
    ? null
    : { full: '▮'.repeat(rank), empty: '▮'.repeat(EFFORT_CELLS - rank), color: EFFORT_COLORS[rank - 1] }
}

// L'ultima riga «Verdetto: …» della risposta di un agent di review; null se la risposta non ne porta
function parseVerdict(text: string): Pick<GateReport, 'verdict' | 'isBlocking'> | null {
  const value = [...text.matchAll(/\bVerdetto:(.*)$/gim)].at(-1)?.[1]?.toUpperCase()

  if (value === undefined) {
    return null
  }

  // Un verdetto che non e' fra quelli previsti resta sconosciuto e si mostra in giallo
  const verdict = VERDICTS.find(token => value.includes(token)) ?? '?'

  return { verdict, isBlocking: BLOCKING.includes(verdict) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const offset = await hostOffset($)

    await update($, offsetMinutes, () => offset)
    await refreshGit($)
    await measure($, await $.session.usage())

    const id = await $.session.model()
    await update($, model, () => id)
    await refreshUltracode($)

    // Ogni conversazione pesca a caso lo stile dell'animazione dell'effort; dopo un reload della mod tiene il suo
    const sessionId = await $.session.id()
    await update($, effortStyle, previous => pickEffortStyle(previous ?? null, sessionId, randomUnit()))

    // Dopo un reload della mod la conversazione e' la stessa: le skill gia' raccolte restano
    if ((await read($, conversation)) !== sessionId) {
      await reloadSkills($)
    }

    // I worktree li tiene la conversazione: dopo un reload restano, e si aggiungono quelli dei messaggi
    await rescanChatWorktrees($)

    // Rinnovi, stato git e ultracode avanzano anche a sessione ferma (commit e push dal terminale, selettore
    // dell'app); modello ed effort no: arrivano solo con la richiesta successiva
    $.clock.every(60_000, () => void Promise.all([tick($), refreshGit($), refreshUltracode($)]))

    return started
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await clearSkills($)
    }

    return next(e)
  })

  // `/nome`, tool Skill o precaricamento, anche da un subagent
  on('skill.prompt', async ($, e, next) => {
    await addSkills($, [e.skill], true)

    return next(e)
  })

  // Un prompt nuovo apre un turno: da qui le skill nuove sono solo quelle caricate dopo. Il primo prompt
  // dopo /clear o una ripresa trova un'altra conversazione e ne rilegge le skill
  on('prompt.submit', async ($, e, next) => {
    if ((await read($, conversation)) !== (await $.session.id())) {
      await reloadSkills($)
      await rescanChatWorktrees($)
    }

    await update($, recentSkills, () => [])

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e)

    return next(e)
  })

  // Modello ed effort del loop principale a ogni richiesta: seguono /model, /effort e i fallback
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const level = e.effort ?? null

      if ((await read($, model)) !== e.model) {
        await update($, model, () => e.model)
      }

      if ((await read($, effort)) !== level) {
        await update($, effort, () => level)
      }

      // Una volta per turno: l'app accende e spegne l'ultracode tra un turno e l'altro
      if (e.index === 0) {
        await refreshUltracode($)
      }
    }

    return yield* next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    const id = spawned.agentId

    if (id !== undefined && GATES.includes(e.subagentType)) {
      await update($, gateTypes, gates => ({ ...gates, [id]: e.subagentType }))
      await update($, running, gates => ({ ...gates, [id]: e.subagentType }))
    }

    return spawned
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId

    if (id === undefined) {
      await refreshGit($)

      return done
    }

    await update($, running, gates => {
      const { [id]: _, ...rest } = gates

      return rest
    })

    // Un subagent che non e' una review non porta verdetti
    const agent = (await read($, gateTypes))[id]
    const found = agent === undefined ? null : parseVerdict(e.answer)

    if (agent !== undefined && found !== null) {
      const offset = await read($, offsetMinutes)
      const at = offset === null ? null : clock(await $.clock.now(), offset)
      // Lancio e riprese dello stesso agent: il giro di review a cui siamo (al massimo 2, CLAUDE.md par. 7)
      const round = ((await read($, rounds))[id] ?? 0) + 1

      await update($, rounds, all => ({ ...all, [id]: round }))
      await update($, report, () => ({ agent, ...found, at, round }))

      if (CODE_GATES.includes(agent)) {
        await update($, isCodeUnreviewed, () => false)
      }
    }

    return done
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const done = await next(e)
    const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path

    if (APP_CODE.test(path) && done.deny === undefined && done.isError !== true) {
      await update($, isCodeUnreviewed, () => true)
    }

    return done
  })

  // Un tool che nomina un worktree lo fa diventare di questa chat: un cd, un git -C, un file da leggere o da
  // scrivere, il percorso che EnterWorktree o un agent isolato restituiscono. Dell'esito conta solo quel percorso:
  // l'output di un git worktree list nomina anche i worktree delle altre chat
  on('tool.call', async ($, e, next) => {
    const done = await next(e)

    if (done.deny !== undefined) {
      return done
    }

    const input = JSON.stringify(e)
    const result: unknown = done.result
    const created =
      typeof result === 'object' && result !== null && 'worktreePath' in result && typeof result.worktreePath === 'string'
        ? result.worktreePath
        : ''

    // Un worktree appena creato o tolto cambia l'elenco del clone: va riletto prima di cercarvi i nomi
    if (/worktree/i.test(input) || created !== '') {
      await refreshWorktrees($)
    }

    if (await addChatWorktrees($, namedWorktrees(`${input}\n${created}`, await read($, repoWorktrees)))) {
      await showChatWorktrees($)
    }

    return done
  })

  // Una ripresa con SendMessage: la review gira di nuovo
  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const to = (e as unknown as Record<string, unknown>).to
    const agent = typeof to === 'string' ? (await read($, gateTypes))[to] : undefined

    if (typeof to === 'string' && agent !== undefined) {
      await update($, running, gates => ({ ...gates, [to]: agent }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const name = await read($, branch)
    const folder = await read($, worktree)
    const work = await read($, git)
    const last = await read($, report)
    const inProgress = [...new Set(Object.values(await read($, running)))]
    const isUnreviewed = await read($, isCodeUnreviewed)
    const windows = await read($, limits)
    const usd = await read($, chatUsd)
    const fill = await read($, context)
    const modelId = await read($, model)
    const level = await read($, effort)
    const style = await read($, effortStyle)
    const isUltra = await read($, isUltracode)
    const offset = await read($, offsetMinutes)
    const nowMs = await read($, now)
    const loadedSkills = await read($, skills)
    const newSkills = await read($, recentSkills)
    const fromRepo = await read($, repoSkills)
    const isOpen = await read($, isSkillsOpen)
    const chatWorktrees = await read($, worktrees)
    const isWorktreeListOpen = await read($, isWorktreesOpen)
    const { Box, Button, Text } = $.ui.resolve(e)
    const color =
      last === null ? undefined : last.isBlocking ? 'error' : CLEAN_VERDICTS.includes(last.verdict) ? 'success' : 'warning'
    // ⚠ con il selettore di testo, altrimenti alcuni font lo disegnano come emoji
    const icon = color === 'error' ? '✗' : color === 'success' ? '✓' : '⚠︎'

    // Il worktree solo se il branch non ne porta gia' il nome, senza il suffisso casuale dell'app
    const wt = folder === null || name?.split('/').pop() === folder ? null : folder.replace(/-[0-9a-f]{6}$/, '')
    // I worktree di questa chat accanto al ramo, col ramo da cui sono partiti
    const from = (found: ChatWorktree) => (found.base === null ? '' : ` da ${found.base}`)
    // L'ultracode e' la sesta tacca, dopo max, come nel selettore dell'app
    const steps = isUltra
      ? { full: '▮'.repeat(EFFORT_CELLS), empty: '', color: ULTRACODE_COLOR }
      : level === null
        ? null
        : effortCells(level)
    const contextPercent = fill?.percent ?? null

    const pending =
      work === null
        ? []
        : [
            work.changed > 0 ? plural(work.changed, 'modificato', 'modificati') : null,
            work.untracked > 0 ? plural(work.untracked, 'nuovo', 'nuovi') : null,
            name === '(detached)'
              ? null
              : !work.isOnRemote
                ? '⇡ non su origin'
                : work.ahead
                  ? `⇡ ${plural(work.ahead, 'commit da pushare', 'commit da pushare')}`
                  : null,
          ].filter(part => part !== null)

    // Barra e percentuale nel colore della soglia: giallo dal 50%, rosso dall'80%
    const meter = (percent: number) => {
      const [full, empty] = cells(percent)
      const tone = percentColor(percent)

      return (
        <Text>
          <Text color={tone}>{full}</Text>
          <Text dimColor>{empty}</Text>
          <Text color={tone}> {Math.round(percent)}%</Text>
        </Text>
      )
    }

    // Una cella vuota tiene allineate le righe della griglia
    const blank = <Text> </Text>

    // Etichetta e barra di una finestra dei limiti, con il rinnovo
    const limitCells = (kind: string, label: string) => {
      const limit = windows.find(w => w.kind === kind)

      if (limit === undefined) {
        return [blank, blank]
      }

      const resetsMs = limit.resetsAt === null ? NaN : Date.parse(limit.resetsAt)

      return [
        <Text wrap="truncate-end">{label}</Text>,
        <Text wrap="truncate-end">
          {meter(limit.percentUsed)}
          <Text dimColor>{Number.isNaN(resetsMs) ? '' : ` ${renewal(resetsMs, nowMs, offset)}`}</Text>
        </Text>,
      ]
    }

    const effortCell =
      level === null && !isUltra ? (
        blank
      ) : (
        <Text wrap="truncate-end">
          {steps === null ? null : <Text color={steps.color}>{steps.full}</Text>}
          {steps === null ? null : <Text dimColor>{steps.empty} </Text>}
          {isUltra ? <Text color={ULTRACODE_COLOR}>ultracode</Text> : <Text dimColor>{String(level)}</Text>}
        </Text>
      )

    const contextCell =
      fill === null || contextPercent === null ? (
        blank
      ) : (
        <Text wrap="truncate-end">
          {meter(contextPercent)}
          <Text dimColor>
            {' '}
            {fill.tokens === null ? '' : tokens(fill.tokens)}/{tokens(fill.window)}
          </Text>
        </Text>
      )

    // Righe 2 e 3 come griglia: etichette e barre in colonna, cosi' le barre partono allineate
    const rows = [
      modelId === null && contextPercent === null
        ? null
        : [
            modelId === null ? blank : <Text wrap="truncate-end">{modelLabel(modelId)}</Text>,
            effortCell,
            contextPercent === null ? blank : <Text wrap="truncate-end">Contesto</Text>,
            contextCell,
            blank,
            blank,
          ],
      windows.length === 0 && usd === null && loadedSkills.length === 0
        ? null
        : [
            ...limitCells('five_hour', '5h'),
            ...limitCells('seven_day', 'Settimana'),
            usd === null ? (
              blank
            ) : (
              <Text dimColor wrap="truncate-end">
                Costo chat <Text bold>{dollars(usd)}</Text>
              </Text>
            ),
            loadedSkills.length === 0 ? (
              blank
            ) : (
              <Button
                key="skills"
                plain
                dimColor
                label={`skill ${loadedSkills.length}${newSkills.length > 0 ? ' ●' : ''} ${isOpen ? '▾' : '▸'}`}
                onPress={() => void update($, isSkillsOpen, open => !open)}
              />
            ),
          ],
    ].filter(row => row !== null)
    // Ogni cella sta su una riga e si tronca; etichette e pulsante non si stringono, cedono spazio le barre
    const column = (index: number, isFixed = false) => (
      <Box flexDirection="column" flexShrink={isFixed ? 0 : 1}>
        {rows.map(row => row[index] ?? blank)}
      </Box>
    )

    const band = (
      <Box flexDirection="column" flexShrink={1}>
        <Box columnGap={1}>
          <Button key="session-id" plain dimColor label="📎" onPress={press => void copySessionId($, press.surface)} />
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              {wt === null ? null : <Text color="warning">wt {wt} · </Text>}
              <Text dimColor>{name ?? 'nessun branch'}</Text>
              {/* Nel terminale niente bottone: i worktree della chat stanno tutti sulla riga, ciascuno col suo ramo di partenza */}
              {chatWorktrees.length === 0 ? null : (
                <Text color="warning">
                  {' · wt '}
                  {chatWorktrees.map(found => `${found.folder}${from(found)}`).join(', ')}
                </Text>
              )}
              {work === null ? null : pending.length > 0 ? (
                <Text color="warning"> · {pending.join(' · ')}</Text>
              ) : (
                <Text color="success"> · pulito</Text>
              )}
              {last === null ? null : (
                <Text>
                  <Text dimColor> · </Text>
                  <Text color={color}>
                    {icon} {last.agent} {last.verdict}
                    {last.round > 1 ? ` · giro ${last.round}` : ''}
                  </Text>
                  {last.at ? <Text dimColor> {last.at}</Text> : null}
                </Text>
              )}
              {inProgress.length > 0 ? <Text color="warning"> · in corso: {inProgress.join(', ')}</Text> : null}
              {isUnreviewed ? <Text color="warning"> · codice da rivedere</Text> : null}
            </Text>
          </Box>
        </Box>
        {rows.length === 0 ? null : (
          <Box columnGap={3}>
            <Box columnGap={1}>
              {column(0, true)}
              {column(1)}
            </Box>
            <Box columnGap={1}>
              {column(2, true)}
              {column(3)}
            </Box>
            {column(4)}
            {column(5, true)}
          </Box>
        )}
        {isOpen && loadedSkills.length > 0 ? (
          <Box flexWrap="wrap" columnGap={1}>
            {loadedSkills.map(skill => {
              const chip = fromRepo.includes(skill) ? REPO_CHIP : OTHER_CHIP
              const cut = skill.lastIndexOf(':')
              const isNew = newSkills.includes(skill)

              // Le nuove del turno in grassetto con ●; il prefisso del plugin attenuato
              return (
                <Text backgroundColor={chip.backgroundColor} color={chip.color} bold={isNew}>
                  {' '}
                  {cut < 0 ? null : <Text color={PREFIX_COLOR}>{skill.slice(0, cut + 1)}</Text>}
                  {skill.slice(cut + 1)}
                  {isNew ? ' ●' : ''}{' '}
                </Text>
              )
            })}
          </Box>
        ) : null}
      </Box>
    )

    // Il terminale non ha Svg e tiene le righe a caratteri; l'app disegna tre schede con gli anelli
    if (e.surface === 'terminal') {
      return band
    }

    const { Svg } = $.ui.resolve(e)
    // Nell'app l'effort e' un piccolo SVG di sei tacche; un effort numerico non ha tacche
    const rank = isUltra ? EFFORT_CELLS : typeof level === 'string' ? EFFORTS.indexOf(level) + 1 : 0
    const tickColor = isUltra ? ULTRACODE_COLOR : (EFFORT_COLORS[rank - 1] ?? PREFIX_COLOR)
    const frame = { flexDirection: 'column', flexGrow: 1, borderStyle: 'round', borderDimColor: true, paddingX: 1 } as const

    // Un contatore dello stato git: verde a zero, giallo quando c'e' qualcosa da fare
    const counter = (n: number, label: string) => (
      <Text>
        <Text bold color={n === 0 ? 'success' : 'warning'}>
          {n}
        </Text>{' '}
        <Text dimColor>{label}</Text>
      </Text>
    )

    // Un anello con accanto valore e nota: contesto e limiti hanno la stessa forma
    const gauge = (percent: number, label: string, note: string) => (
      <Box columnGap={1} alignItems="center">
        <Svg
          source={ringSvg(percent, percentColor(percent))}
          alt={`${label} ${Math.round(percent)}%`}
          width={30}
          height={30}
        />
        {/* Valore e nota non cedono spazio: a restringersi e' la scheda Lavoro, che tronca il ramo */}
        <Box flexDirection="column" flexShrink={0}>
          {/* La percentuale sta dentro l'anello: accanto restano il nome e la nota */}
          <Text color={percentColor(percent) === 'success' ? undefined : percentColor(percent)}>{label}</Text>
          <Text dimColor>{note}</Text>
        </Box>
      </Box>
    )

    const limitGauges = WINDOWS.map(([kind, label]) => {
      const limit = windows.find(w => w.kind === kind)

      if (limit === undefined) {
        return null
      }

      const resetsMs = limit.resetsAt === null ? NaN : Date.parse(limit.resetsAt)

      return gauge(limit.percentUsed, label, Number.isNaN(resetsMs) ? '' : renewal(resetsMs, nowMs, offset))
    })

    // Il ramo sta sopra le schede, a tutta larghezza: il percorso attenuato e l'ultimo tratto in evidenza,
    // perche' il prefisso (features/alpha/progetto/) e' quasi sempre lo stesso
    const slash = name === null ? -1 : name.lastIndexOf('/')
    // Lo stato salvato sopravvive al ricaricamento della mod: subito dopo un aggiornamento puo' avere ancora la
    // forma vecchia, senza questi campi, finche' la prima lettura di git non lo riscrive
    const base = work?.base ?? null
    const behind = work?.behind ?? null
    const stashes = work?.stashes ?? 0
    const fetchedAt = work?.fetchedAt ?? null

    return (
      <Box flexDirection="column">
        <Box columnGap={1} paddingX={1} alignItems="center">
          <Svg source={BRANCH_ICON} alt="Ramo" width={14} height={14} />
          {/* minWidth a zero: senza, un nome lunghissimo allargherebbe la riga invece di troncarsi */}
          <Box flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end">
              {wt === null ? null : <Text color="warning">wt {wt} · </Text>}
              {name === null ? (
                <Text dimColor>nessun branch</Text>
              ) : (
                <Text>
                  <Text dimColor>{name.slice(0, slash + 1).replace(/\//g, ' / ')}</Text>
                  <Text bold>{name.slice(slash + 1)}</Text>
                </Text>
              )}
            </Text>
          </Box>
          {/* Subito dopo il ramo i worktree di questa chat, in giallo: uno col nome e il ramo di partenza, piu' d'uno
              un contatore che apre la scheda Worktree. Il riquadro riempie la riga e porta skill e 📎 a destra; a
              cedere spazio e' il ramo, non i worktree */}
          <Box flexGrow={1} flexShrink={0} columnGap={1} alignItems="center">
            {chatWorktrees.length === 0 ? null : <Svg source={WORKTREE_ICON} alt="Worktree" width={14} height={14} />}
            {chatWorktrees.length === 1 && chatWorktrees[0] !== undefined ? (
              <Text>
                <Text color="warning">{chatWorktrees[0].folder}</Text>
                <Text dimColor>{from(chatWorktrees[0])}</Text>
              </Text>
            ) : null}
            {chatWorktrees.length > 1 ? (
              <Button key="worktrees" plain onPress={() => void update($, isWorktreesOpen, open => !open)}>
                <Text color="warning">
                  {chatWorktrees.length} worktree {isWorktreeListOpen ? '▾' : '▸'}
                </Text>
              </Button>
            ) : null}
          </Box>
          {/* Il contatore delle skill sta accanto alla graffetta: l'elenco si apre sotto il ramo solo a richiesta */}
          {loadedSkills.length === 0 ? null : (
            <Button
              key="skills"
              plain
              dimColor
              label={`${loadedSkills.length} skill${newSkills.length > 0 ? ' ●' : ''} ${isOpen ? '▾' : '▸'}`}
              onPress={() => void update($, isSkillsOpen, open => !open)}
            />
          )}
          <Button key="session-id" plain dimColor label="📎" onPress={press => void copySessionId($, press.surface)} />
        </Box>
        {isOpen && loadedSkills.length > 0 ? (
          <Box flexWrap="wrap" columnGap={1} paddingX={1} alignItems="center">
            <Svg source={SKILL_ICON} alt="Skill" width={14} height={14} />
            {loadedSkills.map((skill, index) => {
              const cut = skill.lastIndexOf(':')

              // Prefisso del plugin attenuato, skill di progetto in azzurro, ● verde su quelle caricate in questo
              // turno. Il separatore segue il nome, cosi' una riga andata a capo non comincia con un punto
              return (
                <Text>
                  {cut < 0 ? null : <Text color={PREFIX_COLOR}>{skill.slice(0, cut + 1)}</Text>}
                  <Text color={fromRepo.includes(skill) ? REPO_SKILL_COLOR : undefined}>{skill.slice(cut + 1)}</Text>
                  {newSkills.includes(skill) ? <Text color="success"> ●</Text> : null}
                  {index < loadedSkills.length - 1 ? <Text dimColor> ·</Text> : null}
                </Text>
              )
            })}
          </Box>
        ) : null}
        <Svg source={SPACER} alt="Separatore" width={1} height={5} />
        {/* La scheda Worktree sopra le altre tre, aperta dal contatore: da dove parte, cartella, ultimo tratto del
            ramo. Con un worktree solo non serve, nome e partenza stanno gia' accanto al ramo */}
        {isWorktreeListOpen && chatWorktrees.length > 1 ? (
          <Box flexDirection="column">
            <Box {...frame}>
              <Text bold>Worktree</Text>
              <Box columnGap={2}>
                <Box flexDirection="column" flexShrink={0}>
                  {chatWorktrees.map(found => (
                    <Text dimColor>{found.base === null ? '—' : `da ${found.base}`}</Text>
                  ))}
                </Box>
                <Box flexDirection="column" flexShrink={0}>
                  {chatWorktrees.map(found => (
                    <Text color="warning">{found.folder}</Text>
                  ))}
                </Box>
                <Box flexDirection="column" flexShrink={1} minWidth={0}>
                  {chatWorktrees.map(found => (
                    <Text wrap="truncate-end">{found.branch === null ? '(detached)' : found.branch.split('/').pop()}</Text>
                  ))}
                </Box>
              </Box>
            </Box>
            <Svg source={SPACER} alt="Separatore" width={1} height={5} />
          </Box>
        ) : null}
        <Box columnGap={1}>
          <Box {...frame}>
            <Text bold>Stato git</Text>
            {/* Solo numeri ed etichette corte: un testo lungo qui allarga la scheda e spinge fuori le altre */}
            {work === null ? (
              <Text dimColor>non è un repository git</Text>
            ) : (
              <Box columnGap={2}>
                <Box flexDirection="column">
                  {counter(work.changed + work.untracked, 'modificati')}
                  {base === null || behind === null ? null : counter(behind, `dietro ${base}`)}
                </Box>
                <Box flexDirection="column">
                  {name === '(detached)' ? null : work.isOnRemote ? (
                    counter(work.ahead ?? 0, 'da pushare')
                  ) : (
                    <Text color="warning">non su origin</Text>
                  )}
                  <Text>
                    <Text bold>{stashes}</Text> <Text dimColor>stash</Text>
                  </Text>
                </Box>
              </Box>
            )}
            {fetchedAt === null ? null : <Text dimColor>fetch {ago(nowMs - fetchedAt)}</Text>}
            {last === null ? null : (
              <Text color={color} wrap="truncate-end">
                {icon} {last.agent} {last.verdict}
                {last.round > 1 ? ` · giro ${last.round}` : ''}
                {last.at ? ` · ${last.at}` : ''}
              </Text>
            )}
            {inProgress.length > 0 ? <Text color="warning">in corso: {inProgress.join(', ')}</Text> : null}
            {isUnreviewed ? <Text color="warning">codice da rivedere</Text> : null}
          </Box>
          <Box {...frame}>
            {/* Il nome del modello fa da titolo della scheda; sotto l'anello chiudono tacche e livello */}
            <Text bold wrap="truncate-end">
              {modelId === null ? 'Modello' : modelLabel(modelId)}
            </Text>
            {fill === null || contextPercent === null
              ? null
              : gauge(
                  contextPercent,
                  'Contesto',
                  `${fill.tokens === null ? '' : `${tokens(fill.tokens)} di `}${tokens(fill.window)}`,
                )}
            <Box columnGap={1} alignItems="center">
              {rank === 0 ? null : (
                <Svg
                  source={effortSvg(rank, tickColor, e.props.isWorking, style?.style)}
                  alt={`Effort ${isUltra ? 'ultracode' : String(level)}`}
                  width={38}
                  height={18}
                  // Da fermo e' un'immagine come gli anelli, senza sfondo; il riquadro animato serve solo al lavoro
                  isInteractive={e.props.isWorking}
                />
              )}
              {isUltra ? (
                <Text color={ULTRACODE_COLOR}>ultracode</Text>
              ) : level === null ? null : (
                <Text dimColor>{String(level)}</Text>
              )}
            </Box>
          </Box>
          <Box {...frame}>
            <Text bold>Limiti</Text>
            <Box columnGap={2}>{limitGauges}</Box>
            {usd === null ? null : (
              <Text dimColor>
                Costo <Text bold>{dollars(usd)}</Text>
              </Text>
            )}
          </Box>
        </Box>
      </Box>
    )
  })
}
