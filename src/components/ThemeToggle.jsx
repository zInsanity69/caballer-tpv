import { useState } from 'react'
import { getTheme, toggleTheme } from '../lib/theme.js'

// Botón sol/luna para alternar tema claro/oscuro.
// variant="icon" → botón compacto para la topbar; variant="item" → fila del menú hamburguesa.
export default function ThemeToggle({ variant = 'icon', onToggle }) {
  const [theme, setTheme] = useState(getTheme)
  const handle = () => { const t = toggleTheme(); setTheme(t); onToggle && onToggle(t) }
  const esClaro = theme === 'light'

  if (variant === 'item') {
    return (
      <button className="hamburger-item" onClick={handle}>
        <i className={`fi ${esClaro ? 'fi-rr-moon' : 'fi-rr-sun'}`}/>
        {esClaro ? 'Tema oscuro' : 'Tema claro'}
      </button>
    )
  }
  return (
    <button type="button" className="btn-o btn-eye" onClick={handle}
      title={esClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
      style={{ padding: '6px 9px', flexShrink: 0 }}>
      <i className={`fi ${esClaro ? 'fi-rr-moon' : 'fi-rr-sun'}`}/>
    </button>
  )
}
