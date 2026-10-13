import { expect, test } from 'claude-code/testing'

import { EFFORT_STYLE_NAMES, effortSvg, pickEffortStyle } from '../hooks/effort'

const COLORS = ['#7cc8ff', '#5aafff', '#3d95ff', '#2f78f5', '#2d5be3', '#a970ff']

test('il giro ha i 22 stili scelti, gelatina compresa', async () => {
  expect(EFFORT_STYLE_NAMES.length).toBe(22)
  expect(EFFORT_STYLE_NAMES).toContain('gelatina')
  expect(EFFORT_STYLE_NAMES).toContain('batteria')
})

test('ogni stile si anima solo mentre Claude lavora, e a low resta fermo', async () => {
  for (const style of EFFORT_STYLE_NAMES) {
    for (let rank = 1; rank <= 6; rank += 1) {
      const color = COLORS[rank - 1] ?? '#000000'
      const resting = effortSvg(rank, color, false, style)
      const working = effortSvg(rank, color, true, style)

      // Da ferme: le tacche accese nel colore del livello, nessuna animazione
      expect(resting).not.toContain('<animate')
      expect(resting.split(color).length - 1).toBe(rank)

      // Al lavoro: low resta ferma, dagli altri livelli in su le tacche si muovono
      if (rank === 1) {
        expect(working).not.toContain('<animate')
      } else {
        expect(working).toContain('<animate')
      }

      // Ogni rettangolo aperto e' anche chiuso
      expect(working.split('<rect').length).toBe(working.split('</rect>').length)
      expect(working.startsWith('<svg')).toBe(true)
      expect(working.endsWith('</svg>')).toBe(true)
      expect(working).not.toContain('NaN')
      expect(working).not.toContain('undefined')
    }
  }
})

test('lo stile resta lo stesso nella stessa chat e cambia in una chat nuova', async () => {
  const first = pickEffortStyle(null, 'chat-a', 0)

  expect(first).toEqual({ conversation: 'chat-a', style: EFFORT_STYLE_NAMES[0] ?? '' })
  // Un reload della mod nella stessa chat non ripesca
  expect(pickEffortStyle(first, 'chat-a', 0.99)).toEqual(first)
  // Una chat nuova pesca di nuovo
  expect(pickEffortStyle(first, 'chat-b', 0.99)).toEqual({
    conversation: 'chat-b',
    style: EFFORT_STYLE_NAMES[EFFORT_STYLE_NAMES.length - 1] ?? '',
  })
  // Uno stile tolto dal giro viene ripescato fra quelli che ci sono
  expect(EFFORT_STYLE_NAMES).toContain(pickEffortStyle({ conversation: 'chat-a', style: 'sparito' }, 'chat-a', 0.5).style)
})

test('uno stile sconosciuto ricade sulla gelatina', async () => {
  expect(effortSvg(4, '#2f78f5', true, 'sparito')).toBe(effortSvg(4, '#2f78f5', true, 'gelatina'))
})
