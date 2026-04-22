-- Migración: gestión atómica de stock al cancelar/editar tickets

-- Cancela un ticket y devuelve el stock de todos sus productos
create or replace function cancelar_ticket(p_ticket_id uuid)
returns void as $$
declare
  v_caseta_id uuid;
  v_item      record;
begin
  select caseta_id into v_caseta_id from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  for v_item in
    select producto_id, cantidad from ticket_items where ticket_id = p_ticket_id
  loop
    update stock
    set cantidad = cantidad + v_item.cantidad
    where producto_id = v_item.producto_id and caseta_id = v_caseta_id;
  end loop;

  delete from tickets where id = p_ticket_id;
end;
$$ language plpgsql security definer;

-- Actualiza un ticket ajustando el stock de forma atómica:
-- devuelve el stock de los items anteriores y descuenta el de los nuevos
create or replace function actualizar_ticket(
  p_ticket_id    uuid,
  p_nuevo_total  numeric,
  p_nuevos_items jsonb
) returns void as $$
declare
  v_caseta_id uuid;
  v_item      record;
  v_new_item  jsonb;
begin
  select caseta_id into v_caseta_id from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  for v_item in
    select producto_id, cantidad from ticket_items where ticket_id = p_ticket_id
  loop
    update stock
    set cantidad = cantidad + v_item.cantidad
    where producto_id = v_item.producto_id and caseta_id = v_caseta_id;
  end loop;

  delete from ticket_items where ticket_id = p_ticket_id;

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

  update tickets set total = p_nuevo_total where id = p_ticket_id;
end;
$$ language plpgsql security definer;
