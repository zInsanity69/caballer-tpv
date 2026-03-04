// hooks/useCaja.js
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api.js'

export function useCaja(usuario) {
  const [caja, setCaja] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cargarCaja = useCallback(async () => {
    if (!usuario?.caseta_id) return
    setLoading(true)
    try {
      const data = await api.cajaActiva(usuario.caseta_id)
      setCaja(data)
    } catch (e) {
      setCaja(null) // sin caja abierta es normal
    } finally {
      setLoading(false)
    }
  }, [usuario?.caseta_id])

  useEffect(() => { cargarCaja() }, [cargarCaja])

  const abrir = useCallback(async (apertura) => {
    const data = await api.abrirCaja(usuario.caseta_id, apertura)
    setCaja(data)
    return data
  }, [usuario?.caseta_id])

  const unirse = useCallback(() => {
    // La caja ya existe, solo refrescamos para tener datos actualizados
    cargarCaja()
  }, [cargarCaja])

  const cerrar = useCallback(async (contado) => {
    await api.cerrarCaja(caja.caja_id, contado)
    setCaja(null)
  }, [caja?.caja_id])

  const registrarVenta = useCallback((venta) => {
    // Actualiza el estado local optimisticamente
    setCaja(prev => prev ? {
      ...prev,
      num_tickets: (prev.num_tickets || 0) + 1,
      total_efectivo: prev.total_efectivo + (venta.metodo_pago === 'efectivo' ? venta.total : 0),
      total_tarjeta:  prev.total_tarjeta  + (venta.metodo_pago === 'tarjeta'  ? venta.total : 0),
      total_ventas:   prev.total_ventas   + venta.total,
    } : prev)
  }, [])

  return { caja, loading, error, abrir, unirse, cerrar, registrarVenta, recargar: cargarCaja }
}
