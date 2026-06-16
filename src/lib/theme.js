// Tema claro/oscuro — persiste en localStorage y aplica data-theme en <html>.
const KEY = 'tpv_theme'

export function getTheme() {
  return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark'
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light')
  else document.documentElement.removeAttribute('data-theme')
  localStorage.setItem(KEY, t)
  return t
}

export function toggleTheme() {
  return applyTheme(getTheme() === 'light' ? 'dark' : 'light')
}

export function initTheme() {
  applyTheme(getTheme())
}
