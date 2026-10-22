import { CLAY, WARM_GRAY } from './palette'

// L'icona del ramo accanto al nome: tre nodi e i due tratti che li uniscono, nell'arancio Claude. E' un'immagine e
// non legge il tema, quindi il colore e' uno solo e regge chiaro e scuro
export const BRANCH_ICON = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${CLAY}" stroke-width="1.5" stroke-linecap="round">`,
  '<path d="M4 1.5a1.75 1.75 0 1 0 0 3.5a1.75 1.75 0 1 0 0-3.5z"/>',
  '<path d="M4 11a1.75 1.75 0 1 0 0 3.5a1.75 1.75 0 1 0 0-3.5z"/>',
  '<path d="M12 3.5a1.75 1.75 0 1 0 0 3.5a1.75 1.75 0 1 0 0-3.5z"/>',
  '<path d="M4 5v6M12 7c0 3.2-8 1.6-8 4"/>',
  '</svg>',
].join('')

// La scintilla davanti all'elenco delle skill: solo tratti, nel grigio caldo dei prefissi accanto
export const SKILL_ICON = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${WARM_GRAY}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`,
  '<path d="M7 2.5C7.4 5.4 8.6 6.6 11.5 7C8.6 7.4 7.4 8.6 7 11.5C6.6 8.6 5.4 7.4 2.5 7C5.4 6.6 6.6 5.4 7 2.5Z"/>',
  '<path d="M12.5 10.5v3M11 12h3"/>',
  '</svg>',
].join('')

// La forchetta dei worktree accanto al ramo: due rami che partono da un tronco, nell'arancio Claude come il nome
// del worktree accanto
export const WORKTREE_ICON = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${CLAY}" stroke-width="1.5" stroke-linecap="round">`,
  '<circle cx="4" cy="3.25" r="1.75"/>',
  '<circle cx="12" cy="3.25" r="1.75"/>',
  '<circle cx="8" cy="12.75" r="1.75"/>',
  '<path d="M4 5v1.25c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5M8 8.25V11"/>',
  '</svg>',
].join('')

// Uno stacco di pochi pixel fra la riga del ramo e le schede: i margini dei riquadri vanno a righe intere
export const SPACER = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="5"></svg>'
