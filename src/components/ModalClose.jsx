import { useEffect } from 'react'

// Botón X para cerrar un modal (arriba a la derecha) + cierre con tecla Esc.
// Se usa dentro de cada .mc. Sustituye al cierre por clic-fuera (que se quitó
// para no cerrar modales sin querer al tocar el fondo).
export default function ModalClose({ onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <button type="button" className="modal-x" onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)">
      <i className="fi fi-rr-cross-small" />
    </button>
  )
}
