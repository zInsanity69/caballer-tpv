-- Migración: asegurar que crear_ticket descuenta el stock correctamente
create or replace function crear_ticket(
  p_caja_id     uuid,
  p_caseta_id   uuid,
  p_empleado_id uuid,
  p_metodo_pago text,
  p_total       numeric,
  p_dinero_dado numeric,
  p_cambio      numeric,
  p_items       jsonb
) returns uuid as $$
declare
  v_ticket_id uuid;
  v_item      jsonb;
begin
  insert into tickets (caja_id, caseta_id, empleado_id, metodo_pago, total, dinero_dado, cambio)
  values (p_caja_id, p_caseta_id, p_empleado_id, p_metodo_pago, p_total, p_dinero_dado, p_cambio)
  returning id into v_ticket_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into ticket_items (
      ticket_id, producto_id, nombre_producto,
      precio_unitario, cantidad, total_linea, con_oferta, detalle_oferta
    ) values (
      v_ticket_id,
      (v_item->>'producto_id')::uuid,
      v_item->>'nombre',
      (v_item->>'precio_unitario')::numeric,
      (v_item->>'cantidad')::int,
      (v_item->>'total_linea')::numeric,
      (v_item->>'con_oferta')::boolean,
      v_item->>'detalle_oferta'
    );

    -- Descontar stock en BD (con bloqueo de fila)
    perform descontar_stock(
      (v_item->>'producto_id')::uuid,
      p_caseta_id,
      (v_item->>'cantidad')::int
    );
  end loop;

  return v_ticket_id;
end;
$$ language plpgsql security definer;
