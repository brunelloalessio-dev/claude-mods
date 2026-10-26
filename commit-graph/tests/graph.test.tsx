import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'commit-graph',
  component: 'Pane',
  requestId: 'commit-graph',
  props: {
    title: 'Grafo git',
    isFocused: false,
    bodyColumns: 57,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 59 },
    view: {},
  },
} as const

const id = (name: string) => name.padEnd(40, '0')
const NOW = 1_761_130_000

type Fake = { hash: string; parents: string[]; subject: string }

// Un repository finto: il ramo corrente «feature» ha appena unito alpha, con un tag più in basso
const SMALL: Fake[] = [
  { hash: id('c5'), parents: [id('c4'), id('b2')], subject: "Merge 'origin/alpha' into feature" },
  { hash: id('b2'), parents: [id('b1')], subject: 'Correzione su alpha' },
  { hash: id('c4'), parents: [id('c3')], subject: 'Nuova schermata' },
  { hash: id('b1'), parents: [id('c3')], subject: 'Primo lavoro su alpha' },
  { hash: id('c3'), parents: [id('c2')], subject: 'Rilascio' },
  { hash: id('c2'), parents: [id('c1')], subject: 'Secondo commit' },
  { hash: id('c1'), parents: [], subject: 'Primo commit' },
]

const LONG: Fake[] = Array.from({ length: 400 }, (_, index) => ({
  hash: id(`a${index}`),
  parents: index === 399 ? [] : [id(`a${index + 1}`)],
  subject: `Commit numero ${index}`,
}))

// Le risposte di git come le dà con le opzioni che usa la mod (-z, --porcelain=v1, date già formattate)
function answer(argv: readonly string[], commits: Fake[], branch: string): string {
  if (argv[0] === 'date') return '14:30\n'

  const command = argv.filter(arg => arg !== '--no-optional-locks' && arg !== '-c' && arg !== 'core.quotePath=false').slice(1)
  const [verb] = command

  if (verb === 'rev-parse' && command.includes('--show-toplevel')) return '/repo/progetto\n'
  if (verb === 'rev-parse' && command.includes('--is-shallow-repository')) return 'false\n'
  if (verb === 'rev-parse') return `${commits[0]?.hash ?? ''}\n`
  if (verb === 'symbolic-ref') return `refs/heads/${branch}\n`
  if (verb === 'status') return ' M src/a.ts\0?? nuovo.txt\0'
  if (verb === 'for-each-ref') {
    return [
      `${commits[0]?.hash ?? ''}\x1f\x1frefs/heads/${branch}`,
      `${commits[0]?.hash ?? ''}\x1f\x1frefs/remotes/origin/${branch}`,
      `${id('b2')}\x1f\x1frefs/remotes/origin/alpha`,
      `${id('dd')}\x1f${id('c3')}\x1frefs/tags/v1`,
    ].join('\n')
  }
  if (verb === 'log') {
    const max = Number(command.find(arg => arg.startsWith('--max-count='))?.split('=')[1] ?? '0')

    return commits
      .slice(0, max)
      .map((commit, index) => `${commit.hash}\x1f${commit.parents.join(' ')}\x1fAlessio\x1f${NOW - index * 600}\x1f22/10/2026 13:05\x1f${commit.subject}`)
      .join('\0')
  }
  if (verb === 'show') return 'Nuova schermata\n\nPrima riga del corpo\nSeconda riga del corpo\n'
  if (verb === 'diff' && command.includes('--name-status')) return 'M\0src/a.ts\0A\0src/b.ts\0'
  if (verb === 'diff') return '3\t1\tsrc/a.ts\x0010\t0\tsrc/b.ts\0'

  return ''
}

type On = Parameters<TestBody>[1]

// opened raccoglie i pannelli aperti, runs i comandi lanciati: servono a vedere che la mod resta ferma finché non la si apre
function engine(on: On, commits: Fake[], branch: string, filled: string[], opened: string[] = [], runs: string[] = []) {
  on('command.register', () => ({ value: { command: 'grafo' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: opened.map(pane => ({ id: pane, title: 'Grafo git', isShown: true, isFocused: false, isPlaced: true })) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/repo/progetto/app' }))
  on('turn.complete', () => ({ text: '' }))
  on('clock.now', () => ({ value: NOW * 1000 }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    runs.push(e.argv.join(' '))

    return {
      value: { exitCode: 0, stdout: answer(e.argv, commits, branch), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)

    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
}

test('il pannello non si apre da solo: lo apre /grafo, e prima git non si legge', async ($, on) => {
  const opened: string[] = []
  const runs: string[] = []

  engine(on, SMALL, 'feature', [], opened, runs)
  await $.session.start({ cwd: '/repo/progetto/app', surface: 'desktop', isInteractive: true })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  expect(opened).toEqual([])
  expect(runs).toEqual([])

  const done = await $.command.run({
    command: 'grafo',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 57 },
  })

  expect(done.text).toBe('Grafo git aperto.')
  expect(opened).toEqual(['commit-graph'])

  // Aperto il pannello, la lettura parte: «Aggiorna» la aspetta, così il test non finisce a lettura in corso
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'aggiorna' })
  expect(runs.length).toBeGreaterThan(0)
  expect(await ui.find({ type: 'Text', text: /^Nuova schermata$/ })).toBeDefined()
  await ui.unmount()
})

test('il grafo si disegna, un commit si apre sotto la riga e Spiega scrive nel prompt', async ($, on) => {
  const filled: string[] = []

  engine(on, SMALL, 'feature', filled)
  await $.session.start({ cwd: '/repo/progetto/app', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'aggiorna' })
  expect(await ui.find({ type: 'Text', text: /Modifiche non committate \(2\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Nuova schermata$/ })).toBeDefined()

  await ui.press({ key: `riga-${id('c4')}` })
  expect((await ui.find({ type: 'Text', text: /File cambiati/ }))?.text).toBe('File cambiati: 2')
  expect(await ui.find({ type: 'Text', text: /Prima riga del corpo/ })).toBeDefined()

  await ui.press({ key: 'spiega' })
  expect(filled[0]).toContain('Spiegami il commit `c400000` («Nuova schermata»)')

  await ui.press({ key: 'cherry-pick' })
  expect(filled[1]).toContain('cherry-pick del commit `c400000`')
  expect(filled[1]).not.toContain('ramo protetto')

  // Un secondo clic sulla stessa riga chiude il dettaglio
  await ui.press({ key: `riga-${id('c4')}` })
  expect(await ui.find({ type: 'Text', text: /File cambiati/ })).toBeUndefined()
  await ui.unmount()
})

test('su un ramo protetto la richiesta a Claude lo dice', async ($, on) => {
  const filled: string[] = []

  engine(on, SMALL, 'alpha', filled)
  await $.session.start({ cwd: '/repo/progetto/app', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'aggiorna' })
  await ui.press({ key: `riga-${id('c4')}` })
  await ui.press({ key: 'reset' })
  expect(filled[0]).toContain('alpha è un ramo protetto')
  await ui.unmount()
})

test('la ricerca trova un commit dal nome del tag', async ($, on) => {
  engine(on, SMALL, 'feature', [])
  await $.session.start({ cwd: '/repo/progetto/app', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'aggiorna' })
  await ui.input({ key: 'cerca', text: 'v1', kind: 'change' })
  expect((await ui.find({ type: 'Text', text: /trovati fra gli ultimi/ }))?.text).toContain('1 trovati fra gli ultimi 7 commit')
  expect(await ui.find({ type: 'Text', text: /^Rilascio$/ })).toBeDefined()
  await ui.unmount()
})

test('trecento commit si disegnano e se ne possono caricare altri', async ($, on) => {
  engine(on, LONG, 'feature', [])
  await $.session.start({ cwd: '/repo/progetto/app', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'aggiorna' })
  // Si disegnano 60 righe per volta, anche se ne sono caricate 300: la prima è quella delle modifiche
  expect(await ui.find({ type: 'Text', text: /^Commit numero 58$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Commit numero 59$/ })).toBeUndefined()

  for (let page = 0; page < 5; page++) {
    await ui.press({ key: 'mostra' })
  }

  expect(await ui.find({ type: 'Text', text: /^Commit numero 299$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Commit numero 300$/ })).toBeUndefined()

  await ui.press({ key: 'altri' })
  expect(await ui.find({ type: 'Text', text: /^Commit numero 399$/ })).toBeDefined()
  await ui.unmount()
})

test('nel terminale resta un elenco semplice', async ($, on) => {
  engine(on, SMALL, 'feature', [])
  await $.session.start({ cwd: '/repo/progetto/app', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Nuova schermata|Leggo il repository/ })).toBeDefined()
  await ui.unmount()
})
