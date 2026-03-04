import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser'
import { getProductoByEan } from '../lib/api.js'

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880; o.type = 'sine'
    g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18)
  } catch (e) {}
}

export default function Scanner({ onDetect, onClose }) {
  const videoRef   = useRef(null)
  const readerRef  = useRef(null)
  const lastCode   = useRef('')
  const lastTime   = useRef(0)

  const [estado, setEstado]   = useState('iniciando') // iniciando | activo | error
  const [msg, setMsg]         = useState('')
  const [manual, setManual]   = useState('')
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    let cancelled = false

    const iniciar = async () => {
      try {
        const hints = new Map()
        hints.set(2 /* DecodeHintType.POSSIBLE_FORMATS */, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
        ])

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 1500,
        })
        readerRef.current = reader

        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (!devices.length) throw new Error('No se encontró ninguna cámara')

        // Preferir cámara trasera
        const trasera = devices.find(d =>
          /back|rear|trasera|environment/i.test(d.label)
        ) || devices[devices.length - 1]

        if (cancelled) return
        setEstado('activo')

        await reader.decodeFromVideoDevice(
          trasera.deviceId,
          videoRef.current,
          async (result, err) => {
            if (cancelled || !result) return

            const codigo = result.getText()
            const now = Date.now()

            // Evitar escanear el mismo código en menos de 2 segundos
            if (codigo === lastCode.current && now - lastTime.current < 2000) return
            lastCode.current = codigo
            lastTime.current = now

            playBeep()
            if (navigator.vibrate) navigator.vibrate([80])
            setMsg(`Leyendo: ${codigo}...`)

            // Buscar en Supabase
            const prod = await getProductoByEan(codigo)
            if (prod) {
              onDetect(prod)
            } else {
              setMsg(`Código ${codigo} no encontrado en el catálogo`)
              setManual(codigo)
              setTimeout(() => setMsg(''), 4000)
            }
          }
        )
      } catch (e) {
        if (cancelled) return
        setEstado('error')
        if (e.name === 'NotAllowedError' || /permission/i.test(e.message)) {
          setMsg('Permiso de cámara denegado. Actívalo en los ajustes del navegador.')
        } else if (e.name === 'NotFoundError') {
          setMsg('No se encontró cámara disponible en este dispositivo.')
        } else {
          setMsg('Error al iniciar la cámara: ' + e.message)
        }
      }
    }

    iniciar()

    return () => {
      cancelled = true
      try { readerRef.current?.reset() } catch (e) {}
    }
  }, [])

  const buscarManual = async () => {
    const q = manual.trim()
    if (!q) return
    setBuscando(true)
    setMsg('')
    try {
      const prod = await getProductoByEan(q)
      if (prod) {
        playBeep()
        onDetect(prod)
      } else {
        setMsg(`Código "${q}" no encontrado en el catálogo`)
      }
    } catch (e) {
      setMsg('Error buscando: ' + e.message)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="mo" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mc">
        <div className="mt-modal">📷 Escanear Producto</div>

        {/* Visor cámara */}
        <div className="scp">
          <video ref={videoRef} autoPlay playsInline muted />

          {estado === 'activo' && (
            <>
              {/* Marco */}
              <div style={{
                position: 'absolute', inset: '12%',
                border: '3px solid var(--ac)', borderRadius: 12,
                boxShadow: '0 0 0 9999px rgba(0,0,0,.5)',
                pointerEvents: 'none',
              }} />
              {/* Línea de escaneo animada */}
              <div style={{
                position: 'absolute',
                top: '12%', left: '12%', right: '12%',
                height: 3,
                background: 'linear-gradient(90deg,transparent,var(--ac),transparent)',
                animation: 'scanbeam 2s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
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

        {/* Indicador activo */}
        {estado === 'activo' && (
          <div style={{ textAlign: 'center', fontSize: '.74rem', color: 'var(--green)', margin: '5px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
            Cámara activa · Apunta al código de barras
          </div>
        )}

        {/* Mensaje feedback */}
        {msg && estado !== 'error' && (
          <div className="info-box" style={{ marginBottom: 8, textAlign: 'center' }}>{msg}</div>
        )}

        {/* Búsqueda manual */}
        <div style={{ marginTop: 8, fontSize: '.74rem', color: 'var(--tx2)', marginBottom: 5 }}>
          O introduce el código EAN manualmente:
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="si" style={{ flex: 1 }}
            placeholder="8410278001..."
            value={manual}
            onChange={e => setManual(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarManual()}
            inputMode="numeric"
          />
          <button
            style={{ background: 'var(--ac)', border: 'none', borderRadius: 'var(--rs)', padding: '9px 15px', color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", opacity: buscando ? .5 : 1 }}
            onClick={buscarManual}
            disabled={buscando}
          >
            {buscando ? '...' : 'Buscar'}
          </button>
        </div>

        <button className="btn-s" style={{ marginTop: 12 }} onClick={onClose}>
          Cerrar escáner
        </button>
      </div>
    </div>
  )
}
