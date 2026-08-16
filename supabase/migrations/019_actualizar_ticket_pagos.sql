-- ============================================================
-- 019_actualizar_ticket_pagos.sql
-- BUG: al editar un ticket, `actualizar_ticket` cambiaba `total` pero NO
-- `pago_efectivo` / `pago_tarjeta`. Como el cierre de caja, el total del turno
-- del empleado y el panel de Ventas del admin suman esos dos campos, el dinero
-- ganado NO reflejaba la edición (solo cambiaba el total del ticket).
--
-- Redefinimos `actualizar_ticket` (misma lógica que la 012) añadiendo el
-- recálculo del desglose de pago al nuevo total:
--   · efectivo -> todo a efectivo
--   · tarjeta  -> todo a tarjeta
--   · mixto    -> se mantiene la proporción efectivo/tarjeta original
-- ============================================================

create or replace function actualizar_ticket(
  p_ticket_id    uuid,
  p_nuevo_total  numeric,
  p_nuevos_items jsonb
) returns void as $$
declare
  v_caseta_id uuid;
  v_total_ant numeric;
  v_numero    text;
  v_items_ant jsonb;
  v_item      record;
  v_new_item  jsonb;
begin
  select caseta_id, total, numero_ticket
    into v_caseta_id, v_total_ant, v_numero
    from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  -- Un ticket editado no puede quedar vacío ni a 0 €
  if p_nuevos_items is null
     or jsonb_typeof(p_nuevos_items) <> 'array'
     or jsonb_array_length(p_nuevos_items) = 0
     or coalesce(p_nuevo_total, 0) <= 0 then
    raise exception 'El ticket no puede quedar vacío ni a 0 €. Si hay que anularlo, bórralo o crea una incidencia.';
  end if;

  -- Snapshot de las líneas actuales (antes del cambio)
  v_items_ant := _snapshot_ticket_items(p_ticket_id);

  -- Devolver stock de los items actuales
  for v_item in
    select producto_id, cantidad from ticket_items where ticket_id = p_ticket_id
  loop
    update stock
    set cantidad = cantidad + v_item.cantidad
    where producto_id = v_item.producto_id and caseta_id = v_caseta_id;
  end loop;

  -- Eliminar items antiguos
  delete from ticket_items where ticket_id = p_ticket_id;

  -- Insertar items nuevos y descontar stock
  for v_new_item in select * from jsonb_array_elements(p_nuevos_items)
  loop
    insert into ticket_items (
      ticket_id, producto_id, nombre_producto,
      precio_unitario, cantidad, total_linea, con_oferta, detalle_oferta
    ) values (
      p_ticket_id,
      (v_new_item->>'producto_id')::uuid,
      v_new_item->>'nombre_producto',
      (v_new_item->>'precio_unitario')::numeric,
      (v_new_item->>'cantidad')::int,
      (v_new_item->>'total_linea')::numeric,
      coalesce((v_new_item->>'con_oferta')::boolean, false),
      v_new_item->>'detalle_oferta'
    );

    perform descontar_stock(
      (v_new_item->>'producto_id')::uuid,
      v_caseta_id,
      (v_new_item->>'cantidad')::int
    );
  end loop;

  -- Actualizar total y RECALCULAR el desglose de pago al nuevo total
  update tickets set
    total = p_nuevo_total,
    pago_efectivo = case metodo_pago
      when 'efectivo' then p_nuevo_total
      when 'tarjeta'  then 0
      else round(coalesce(pago_efectivo, 0) * p_nuevo_total / nullif(v_total_ant, 0), 2)
    end,
    pago_tarjeta = case metodo_pago
      when 'tarjeta'  then p_nuevo_total
      when 'efectivo' then 0
      else p_nuevo_total - round(coalesce(pago_efectivo, 0) * p_nuevo_total / nullif(v_total_ant, 0), 2)
    end
  where id = p_ticket_id;

  -- Auditoría (después del cambio)
  insert into ticket_auditoria
    (ticket_id, numero_ticket, caseta_id, perfil_id, accion, total_antes, total_despues, items_antes, items_despues)
  values
    (p_ticket_id, v_numero, v_caseta_id, auth.uid(), 'EDITAR', v_total_ant, p_nuevo_total, v_items_ant, p_nuevos_items);
end;
$$ language plpgsql security definer;
