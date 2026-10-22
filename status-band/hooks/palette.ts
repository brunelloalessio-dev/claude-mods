// I colori della fascia, dalla palette «Argilla» scelta da anteprima il 22 ott 2026 e presa dal design system
// dell'app desktop di Claude: l'arancio Claude (clay) per cio' che e' in ordine e per cio' che fa Claude, il giallo
// per gli avvisi, il rosso per i problemi, e grigi caldi. Sono fissi e non del tema, perche' gli SVG sono immagini:
// ogni tono regge sia il chiaro sia lo scuro
export const CLAY = '#d97757'
export const WARM_GRAY = '#898781'

// Le soglie e gli esiti: in ordine, da guardare, da sistemare
export const TONES = { success: CLAY, warning: '#eda100', error: '#e34948' } as const

export type Tone = keyof typeof TONES

// Le tacche dell'effort: cinque livelli dall'arancio chiaro all'argilla piu' intensa, poi l'ultracode piu' acceso
export const EFFORT_COLORS = ['#f4ae94', '#ee9776', '#e48465', CLAY, '#c6613f']
export const ULTRACODE_COLOR = '#eb6834'

// Le etichette delle skill nel terminale: di progetto su fondo argilla scuro, di plugin e integrate su grigio caldo
export const REPO_CHIP = { backgroundColor: '#4b1b08', color: '#f7d8cb' }
export const OTHER_CHIP = { backgroundColor: '#383835', color: '#c3c2b7' }
