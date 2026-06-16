import { useState } from 'react'
import { consultarCif } from '../lib/api.js'

// Modal reutilizable de factura: pide el CIF, lo busca en apispain.es y deja
// editar/rellenar a mano. Al confirmar llama onConfirm(cliente) con
// { razonSocial, cif, direccion }.
export default function FacturaModal({ onConfirm, onClose, confirmLabel = 'Imprimir factura' }) {
  const [cifInput, setCifInput] = useState('')
  const [cliente, setCliente]   = useState({ razonSocial: '', cif: '', direccion: '' })
  const [buscando, setBuscando] = useState(false)
  const [msg, setMsg]           = useState(null)

  const buscar = async () => {
    const cif = cifInput.trim()
    if (!cif) { setMsg({ type: 'error', text: 'Introduce un CIF' }); return }
    setBuscando(true); setMsg(null)
    const r = await consultarCif(cif)
    setBuscando(false)
    if (r.ok) {
      setCliente({ razonSocial: r.razonSocial || '', cif: r.cif || cif, direccion: r.direccion || '' })
      setMsg({ type: 'ok', text: 'Datos encontrados — revisa y edita si hace falta' })
    } else {
      setCliente(c => ({ ...c, cif }))
      setMsg({ type: 'error', text: `${r.error || 'No encontrado'}. Rellena los datos a mano.` })
    }
  }
  const confirmar = () => {
    if (!cliente.razonSocial.trim() && !cliente.cif.trim()) {
      setMsg({ type: 'error', text: 'Indica al menos la razón social o el CIF del cliente' }); return
    }
    onConfirm(cliente)
  }

  return (
    <div className="mo" style={{ zIndex: 1000 }}>
      <div className="mc">
        <div className="mt-modal"><i className="fi fi-rr-file-invoice"/> Datos para la factura</div>
        <div className="fg">
          <label>CIF / NIF del cliente</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={cifInput} onChange={e => setCifInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="B12345678" style={{ flex: 1 }} />
            <button className="btn-o" onClick={buscar} disabled={buscando} style={{ whiteSpace: 'nowrap' }}>
              {buscando ? 'Buscando…' : <><i className="fi fi-rr-search"/> Buscar</>}
            </button>
          </div>
        </div>
        {msg && <div className={msg.type === 'ok' ? 'ok-box' : 'err-box'}>{msg.text}</div>}
        <div className="fg">
          <label>Razón social</label>
          <input value={cliente.razonSocial} onChange={e => setCliente(c => ({ ...c, razonSocial: e.target.value }))} placeholder="Nombre / razón social del cliente" />
        </div>
        <div className="fg">
          <label>CIF / NIF</label>
          <input value={cliente.cif} onChange={e => setCliente(c => ({ ...c, cif: e.target.value.toUpperCase() }))} placeholder="CIF del cliente" />
        </div>
        <div className="fg">
          <label>Dirección fiscal</label>
          <input value={cliente.direccion} onChange={e => setCliente(c => ({ ...c, direccion: e.target.value }))} placeholder="Domicilio fiscal del cliente" />
        </div>
        <button className="btn-p" onClick={confirmar}><i className="fi fi-rr-file-invoice"/> {confirmLabel}</button>
        <button className="btn-s" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}
