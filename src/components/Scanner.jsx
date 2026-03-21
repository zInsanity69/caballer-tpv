import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser'
import { getProductoByEan } from '../lib/api.js'

export default function Scanner({ onDetect, onClose, ofertas = [], stock = {} }) {
  const videoRef  = useRef(null)
  const readerRef = useRef(null)
  const lastCode  = useRef('')
  const lastTime  = useRef(0)
  const mountedRef = useRef(true)   // ← para no actualizar estado tras desmontar

  const [estado,        setEstado]        = useState('iniciando')
  const [msg,           setMsg]           = useState('')
  const [manual,        setManual]        = useState('')
  const [buscando,      setBuscando]      = useState(false)
  const [prodPendiente, setProdPendiente] = useState(null)
  const [qty,           setQty]           = useState(1)

  // ── Iniciar / reiniciar cámara ─────────────────────────────
  // Bug fix: "volver a escanear" mostraba negro porque el stream
  // anterior no se liberaba bien. Ahora resetamos el reader antes
  // de re-iniciar y usamos una key para forzar remount del video.
  const [camKey, setCamKey] = useState(0)   // cambiar key fuerza nuevo <video>

  const iniciarCamara = useCallback(async () => {
    if (!mountedRef.current) return

    // Liberar reader anterior si existe
    try { readerRef.current?.reset() } catch (_) {}
    readerRef.current = null

    setEstado('iniciando')
    setMsg('')

    try {
      const hints = new Map()
      hints.set(2, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      ])
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 1500,
      })
      readerRef.current = reader

      const devices = await BrowserMultiFormatReader.listVideoInputDevices()
      if (!devices.length) throw new Error('No se encontró ninguna cámara')
      const trasera = devices.find(d => /back|rear|trasera|environment/i.test(d.label)) || devices[devices.length - 1]
      if (!mountedRef.current) return

      // Asegurarnos de que el elemento video existe y es el correcto
      if (!videoRef.current) return

      await reader.decodeFromVideoDevice(trasera.deviceId, videoRef.current, async (result, err) => {
        if (!mountedRef.current || !result) return
        const codigo = result.getText()
        const now = Date.now()
        if (codigo === lastCode.current && now - lastTime.current < 2000) return
        lastCode.current = codigo
        lastTime.current = now
        if (navigator.vibrate) navigator.vibrate([80])
        setMsg(`Leyendo: ${codigo}...`)
        const prod = await getProductoByEan(codigo)
        if (!mountedRef.current) return
        if (prod) {
          setProdPendiente(prod); setQty(1); setMsg('')
        } else {
          setMsg(`Código ${codigo} no encontrado`)
          setManual(codigo)
          setTimeout(() => { if (mountedRef.current) setMsg('') }, 3000)
        }
      })

      if (mountedRef.current) setEstado('activo')
    } catch (e) {
      if (!mountedRef.current) return
      setEstado('error')
      if (e.name === 'NotAllowedError' || /permission/i.test(e.message)) {
        setMsg('Permiso de cámara denegado. Actívalo en los ajustes del navegador.')
      } else if (e.name === 'NotFoundError') {
        setMsg('No se encontró cámara en este dispositivo.')
      } else {
        setMsg('Error al iniciar la cámara: ' + e.message)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    iniciarCamara()
    return () => {
      mountedRef.current = false
      try { readerRef.current?.reset() } catch (_) {}
    }
  }, [camKey])   // ← se re-ejecuta cuando camKey cambia (al pulsar "volver a escanear")

  const volverAEscanear = () => {
    setProdPendiente(null)
    setQty(1)
    lastCode.current = ''
    // Incrementar camKey fuerza desmontaje+remontaje del <video>
    // y re-ejecuta el useEffect → nueva inicialización limpia
    setCamKey(k => k + 1)
  }

  const buscarManual = async () => {
    const q = manual.trim(); if (!q) return
    setBuscando(true); setMsg('')
    try {
      const prod = await getProductoByEan(q)
      if (prod) { setProdPendiente(prod); setQty(1) }
      else setMsg(`Código "${q}" no encontrado`)
    } catch (e) { setMsg('Error: ' + e.message) }
    finally { setBuscando(false) }
  }

  const confirmar = () => {
    if (!prodPendiente) return
    onDetect(prodPendiente, qty)
    setProdPendiente(null); setQty(1); lastCode.current = ''
  }

  const stockDisp = prodPendiente ? (stock[prodPendiente.id] ?? 0) : 0
  const fmt = n => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc">
        <div className="mt-modal">📷 Escanear Producto</div>

        {prodPendiente ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 4 }}>{prodPendiente.nombre}</div>
            <div style={{ fontSize: '.82rem', color: 'var(--tx2)', marginBottom: 16 }}>
              {fmt(prodPendiente.precio)}/u. · Stock: {stockDisp}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6, marginBottom: 12 }}>
              {[1, 2, 3, 4, 5, 6, 8, 10, 15, 20].map(n => (
                <button key={n} onClick={() => setQty(n)} style={{
                  padding: '10px 4px', borderRadius: 'var(--rs)',
                  background: qty === n ? 'var(--ac)' : 'var(--s2)',
                  border: '1px solid', borderColor: qty === n ? 'var(--ac)' : 'var(--bd)',
                  color: qty === n ? 'white' : 'var(--tx)', fontWeight: 700,
                  cursor: 'pointer', fontSize: '1rem', fontFamily: "'DM Sans',sans-serif",
                }}>{n}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button className="qb" style={{ width: 42, height: 42, fontSize: '1.2rem' }} onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
              <input type="number" min="1" max={stockDisp} value={qty}
                onChange={e => setQty(Math.max(1, Math.min(stockDisp, parseInt(e.target.value) || 1)))}
                onKeyDown={e => e.key === 'Enter' && confirmar()}
                style={{ flex: 1, background: 'var(--s2)', border: '2px solid var(--ac)', borderRadius: 'var(--rs)', padding: '12px', color: 'var(--tx)', fontSize: '1.6rem', fontWeight: 700, textAlign: 'center', outline: 'none', fontFamily: "'DM Sans',sans-serif" }}
                inputMode="numeric" autoFocus />
              <button className="qb" style={{ width: 42, height: 42, fontSize: '1.2rem' }} onClick={() => setQty(q => Math.min(stockDisp, q + 1))}>+</button>
            </div>
            <button className="btn-p" onClick={confirmar}>
              Añadir {qty} × {prodPendiente.nombre} · {fmt(prodPendiente.precio * qty)}
            </button>
            {/* Bug fix: ahora volverAEscanear reinicia la cámara correctamente */}
            <button className="btn-s" onClick={volverAEscanear}>← Volver a escanear</button>
          </div>
        ) : (
          <>
            {/* Bug fix: key={camKey} fuerza remount del elemento video
                cuando se reinicia la cámara → evita pantalla negra */}
            <div className="scp">
              <video key={camKey} ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {estado === 'activo' && (
                <>
                  <div style={{ position: 'absolute', inset: '12%', border: '3px solid var(--ac)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,.5)', pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', top: '12%', left: '12%', right: '12%', height: 3, background: 'linear-gradient(90deg,transparent,var(--ac),transparent)', animation: 'scanbeam 2s ease-in-out infinite', pointerEvents: 'none' }} />
                </>
              )}
              {estado === 'iniciando' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.75)', gap: 10 }}>
                  <div className="spinner" />
                  <span style={{ fontSize: '.82rem', color: 'var(--tx2)' }}>Iniciando cámara...</span>
                </div>
              )}
              {estado === 'error' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.85)', gap: 10, padding: 20, textAlign: 'center' }}>
                  <span style={{ fontSize: '2rem' }}>📷</span>
                  <span style={{ fontSize: '.82rem', color: 'var(--red)' }}>{msg}</span>
                </div>
              )}
            </div>

            {estado === 'activo' && (
              <div style={{ textAlign: 'center', fontSize: '.74rem', color: 'var(--green)', margin: '5px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
                Cámara activa · Apunta al código de barras
              </div>
            )}

            {msg && estado !== 'error' && (
              <div className="info-box" style={{ marginBottom: 8, textAlign: 'center' }}>{msg}</div>
            )}

            <div style={{ marginTop: 8, fontSize: '.74rem', color: 'var(--tx2)', marginBottom: 5 }}>O introduce el EAN manualmente:</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="si" style={{ flex: 1 }} placeholder="8410278001..."
                value={manual} onChange={e => setManual(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarManual()} inputMode="numeric" />
              <button style={{ background: 'var(--ac)', border: 'none', borderRadius: 'var(--rs)', padding: '9px 15px', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", opacity: buscando ? .5 : 1 }}
                onClick={buscarManual} disabled={buscando}>{buscando ? '...' : 'Buscar'}</button>
            </div>
          </>
        )}

        <button className="btn-s" style={{ marginTop: 12 }} onClick={onClose}>Cerrar escáner</button>
      </div>
    </div>
  )
}
