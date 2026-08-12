-- ============================================================
-- 011 · RECEPCIÓN PROGRESIVA DE PEDIDOS
-- ============================================================
-- Permite aplicar stock producto a producto según el empleado va
-- revisando el pedido (en vez de todo de golpe al confirmar), para
-- poder abrir y vender mientras se monta la tienda.
--
-- ajustar_stock suma (o resta, con delta negativo para correcciones)
-- la cantidad indicada al stock de una caseta. Crea la fila si no
-- existe y nunca deja el stock por debajo de 0 (respeta el CHECK).
--
-- IMPORTANTE: la BD real usa la tabla `stock` con ids UUID (ver
-- schema.sql), no `stock_por_caseta` con ids INTEGER. Los parámetros
-- deben ser UUID para casar con productos.id / casetas.id.
-- ============================================================

-- Elimina la versión antigua (parámetros INTEGER) por si se llegó a crear,
-- para no dejar dos sobrecargas ambiguas de la función.
DROP FUNCTION IF EXISTS ajustar_stock(INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION ajustar_stock(
  p_producto_id UUID,
  p_caseta_id   UUID,
  p_delta       INTEGER
) RETURNS INTEGER AS $$
DECLARE
  nueva INTEGER;
BEGIN
  INSERT INTO stock (producto_id, caseta_id, cantidad)
  VALUES (p_producto_id, p_caseta_id, GREATEST(0, p_delta))
  ON CONFLICT (producto_id, caseta_id)
  DO UPDATE SET cantidad    = GREATEST(0, stock.cantidad + p_delta),
                updated_at  = now()
  RETURNING cantidad INTO nueva;
  RETURN nueva;
END;
$$ LANGUAGE plpgsql;
