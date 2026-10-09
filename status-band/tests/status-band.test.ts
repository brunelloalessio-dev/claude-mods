import { expect, mock, test } from 'claude-code/testing'
import type { On, Settings } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 200,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// Il motore sotto la mod: orologio fermo, settings dati, subagent e turni che rispondono subito
function engine(on: On, settings: Settings) {
  mock.clock(on, { now: Date.parse('2026-10-08T08:00:00Z') })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('settings.read', () => ({ value: settings }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: `agent-${e.tool_use_id}` }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
}

const step = { turnId: 't1', index: 0, model: 'claude-opus-5-5[1m]', effort: 'xhigh', messageCount: 1 } as const

const spawn = (id: string, subagentType: string) =>
  ({
    tool_use_id: id,
    prompt: 'review',
    description: 'review',
    subagentType,
    provider: { plugin: 'core', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  }) as const

const answer = (id: string, text: string) =>
  ({ answer: text, durationMs: 1000, isAborted: false, turnId: 't1', agentId: `agent-${id}`, reason: 'answer' }) as const

test("nell'app la fascia e' a tre schede con gli anelli, nel terminale resta a righe", async ($, on) => {
  engine(on, {})

  await $.session.measure({
    context: { tokens: 420_000, window: 1_000_000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 31, resetsAt: '2026-10-08T10:41:00Z' },
      { kind: 'seven_day', percentUsed: 85.5, resetsAt: '2026-10-10T08:00:00Z' },
    ],
    cost: { usd: 12.4 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  for await (const _ of $.turn.step(step)) {
    // nessun chunk: risponde il test
  }

  const desktop = await $.ui.mount({ plugin: 'status-band', surface: 'desktop', ...BAND })
  const texts = (await desktop.findAll({ type: 'Text' })).map(found => found.text)
  const joined = texts.join('|')

  // Il ramo sta sopra le schede; la scheda del modello ha per titolo il nome del modello
  expect(texts).toContain('nessun branch')
  expect(texts).toContain('Stato git')
  expect(texts).not.toContain('Modello')
  expect(texts).toContain('Limiti')
  expect(texts).toContain('Opus 5.5')
  expect(texts).toContain('Contesto')
  expect(joined).toContain('420k di 1M')
  expect(texts).toContain('Settimana')
  expect(joined).toContain('↻2h41m')
  expect(joined).toContain('$12,40')

  // Contesto, 5h e settimana: un anello ciascuno, l'ultimo oltre la soglia rossa
  const svgs = (await desktop.findAll({ type: 'Svg' })).map(found => String(found.props.source))
  const rings = svgs.filter(source => source.includes('<circle'))

  expect(rings.length).toBe(3)
  expect(rings.filter(source => source.includes('#f85149')).length).toBe(1)
  // La percentuale e' scritta dentro l'anello
  expect(rings.some(source => source.includes('>42<'))).toBe(true)
  expect(rings.some(source => source.includes('>86<'))).toBe(true)

  // L'effort xhigh: quattro tacche accese nel quarto blu, ferme finche' Claude non lavora
  const ticks = svgs.filter(source => source.includes('<rect'))

  expect(ticks.length).toBe(1)
  expect(ticks[0]?.split('#2f78f5').length).toBe(5)
  expect(ticks[0]).not.toContain('<animate')

  await desktop.unmount()

  // Mentre Claude lavora le tacche accese tremolano come gelatina
  const working = await $.ui.mount({
    plugin: 'status-band',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { ...BAND.props, isWorking: true },
  })
  const moving = (await working.findAll({ type: 'Svg' }))
    .map(found => String(found.props.source))
    .filter(source => source.includes('<rect'))

  expect(moving[0]).toContain('<animate')

  await working.unmount()

  const terminal = await $.ui.mount({ plugin: 'status-band', surface: 'terminal', ...BAND })
  const rows = (await terminal.findAll({ type: 'Text' })).map(found => found.text)

  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(rows).toContain('Contesto')
  expect(rows).not.toContain('Stato git')

  await terminal.unmount()
})

test('il verdetto di una review arriva in fascia col suo giro', async ($, on) => {
  engine(on, {})

  // Un subagent che non e' una review non porta verdetti, anche se ne scrive uno
  await $.agent.spawn(spawn('e1', 'esplora'))
  await $.turn.complete(answer('e1', '## Verdetto: RIFIUTATO'))

  await $.agent.spawn(spawn('c1', 'critic'))
  await $.turn.complete(answer('c1', '## Verdetto: 🟡 **DA CORREGGERE**\n\n#### 🟡 WARNING'))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'status-band', surface, ...BAND })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text).join('|')

    expect(texts).toContain('critic DA CORREGGERE')
    expect(texts).not.toContain('RIFIUTATO')
    expect(texts).not.toContain('giro')

    await ui.unmount()
  }

  // La ripresa dello stesso agent e' il secondo giro
  await $.turn.complete(answer('c1', 'Fix verificati.\n\n## Verdetto: APPROVATO'))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'status-band', surface, ...BAND })
    const texts = (await ui.findAll({ type: 'Text' })).map(found => found.text).join('|')

    expect(texts).toContain('critic APPROVATO')
    expect(texts).toContain('giro 2')

    await ui.unmount()
  }
})

test('un verdetto bloccante del supervisor si vede in rosso', async ($, on) => {
  engine(on, {})

  await $.agent.spawn(spawn('s1', 'supervisor'))
  await $.turn.complete(answer('s1', '## Verdetto: BLOCCATO'))

  const ui = await $.ui.mount({ plugin: 'status-band', surface: 'desktop', ...BAND })
  const found = await ui.findAll({ type: 'Text', text: 'supervisor BLOCCATO' })

  expect(found.map(text => text.props.color)).toContain('error')

  await ui.unmount()
})

test("nell'app le skill sono un contatore accanto al ramo che apre una riga senza sfondo", async ($, on) => {
  engine(on, {})
  on('session.root', () => ({ value: '/repo' }))
  on('fs.exists', (_$, e) => ({ value: e.path === '/repo/.claude/skills/house-style/SKILL.md' }))
  on('skill.prompt', (_$, e) => ({ text: e.text }))

  const empty = await $.ui.mount({ plugin: 'status-band', surface: 'desktop', ...BAND })

  // Senza skill caricate il contatore non c'e'
  expect(await empty.find({ key: 'skills' })).toBeUndefined()

  await empty.unmount()

  await $.skill.prompt({ skill: 'house-style', text: '' })
  await $.skill.prompt({ skill: 'anthropic-skills:built-in-browser', text: '' })

  const ui = await $.ui.mount({ plugin: 'status-band', surface: 'desktop', ...BAND })
  const sparkles = async () =>
    (await ui.findAll({ type: 'Svg' })).filter(found => found.props.alt === 'Skill').length

  // Chiuso: solo il contatore, col ● delle skill caricate in questo turno
  expect((await ui.find({ key: 'skills' }))?.text).toBe('2 skill ● ▸')
  expect(await sparkles()).toBe(0)
  expect(await ui.find({ type: 'Text', text: 'house-style' })).toBeUndefined()

  await ui.press({ key: 'skills' })

  expect((await ui.find({ key: 'skills' }))?.text).toBe('2 skill ● ▾')
  expect(await sparkles()).toBe(1)

  // Quella di progetto in azzurro, quella del plugin col prefisso attenuato, nessuna con lo sfondo
  // La ricerca per testo trova anche il Text che li contiene: serve quello col testo esatto
  const texts = await ui.findAll({ type: 'Text' })
  const repo = texts.find(found => found.text === 'house-style')
  const plugin = texts.find(found => found.text === 'built-in-browser')
  const prefix = texts.find(found => found.text === 'anthropic-skills:')

  expect(repo).toBeDefined()
  expect(plugin).toBeDefined()

  expect(repo?.props.color).toBe('#3d95ff')
  expect(repo?.props.backgroundColor).toBeUndefined()
  expect(plugin?.props.color).toBeUndefined()
  expect(prefix?.props.color).toBe('#8a8a8a')

  await ui.press({ key: 'skills' })

  expect(await sparkles()).toBe(0)

  await ui.unmount()
})

test("il 📎 copia l'ID della sessione: nell'app con pbcopy, nel terminale con la copia del motore", async ($, on) => {
  engine(on, {})
  mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: 'local_abc' })

  const piped: string[] = []
  const copied: string[] = []
  const toasts: string[] = []

  on('process.run', (_$, e, next) => {
    if (e.argv[0] !== 'pbcopy') {
      return next(e)
    }

    piped.push(e.init?.stdin ?? '')

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)

    return { value: { isCopied: true as const } }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'status-band', surface, ...BAND })

    await ui.press({ key: 'session-id' })
    await ui.unmount()
  }

  expect(copied).toEqual(['local_abc'])
  expect(piped).toEqual(['local_abc'])
  expect(toasts).toEqual(['ID sessione copiato: local_abc', 'ID sessione copiato: local_abc'])
})
