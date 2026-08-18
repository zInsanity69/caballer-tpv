-- ============================================================
-- 020_confirmar_recepcion.sql
-- Optimiza la confirmación de recepción de pedidos.
--
-- ANTES: el botón "Confirmar" hacía un bucle en el cliente con una llamada por
-- producto (100+ viajes a la BD en fila) + un reenvío redundante de todas las
-- líneas. Con pedidos grandes se congelaba varios segundos.
--
-- AHORA: una sola función que, en UNA transacción en el servidor:
--   · por cada línea, aplica al stock SOLO el delta que falte
--     (nueva_cantidad_recibida − lo ya guardado en la línea), así es idempotente
--     tanto si se fue marcando producto a producto (recepción progresiva) como
--     si se aceptó todo de golpe.
--   · guarda cantidad_recibida y notas de cada línea.
--   · fija el estado del pedido.
-- Un único viaje, atómico (o todo o nada). La alerta de Telegram sigue en el
-- cliente (necesita la config y la edge function).
--
-- SECURITY DEFINER + guard: el empleado solo su caseta; el admin, cualquiera.
-- ============================================================

create or replace function confirmar_recepcion(
  p_pedido_id uuid,
  p_caseta_id uuid,
  p_items     jsonb,   -- [{ id, producto_id, cantidad_recibida, notas_item }]
  p_estado    text,    -- 'RECIBIDO' | 'INCIDENCIA'
  p_notas     text default null
) returns void as $$
declare
  v_item   jsonb;
  v_actual int;
  v_nueva  int;
  v_delta  int;
begin
  if get_my_rol() <> 'ADMIN' and p_caseta_id <> get_my_caseta() then
    raise exception 'No puedes confirmar la recepción de otra caseta';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Lo ya aplicado al stock = lo guardado en la línea (recepción progresiva)
    select coalesce(cantidad_recibida, 0) into v_actual
      from pedido_items where id = (v_item->>'id')::uuid;

    v_nueva := coalesce((v_item->>'cantidad_recibida')::int, 0);
    v_delta := v_nueva - coalesce(v_actual, 0);

    if v_delta <> 0 then
      insert into stock (producto_id, caseta_id, cantidad)
      values ((v_item->>'producto_id')::uuid, p_caseta_id, greatest(0, v_delta))
      on conflict (producto_id, caseta_id)
      do update set cantidad = greatest(0, stock.cantidad + v_delta),
                    updated_at = now();
    end if;

    update pedido_items
      set cantidad_recibida = v_nueva,
          notas_item        = nullif(v_item->>'notas_item', '')
      where id = (v_item->>'id')::uuid;
  end loop;

  update pedidos
    set estado         = p_estado,
        notas          = nullif(p_notas, ''),
        actualizado_en = now()
    where id = p_pedido_id;
end;
$$ language plpgsql security definer;
