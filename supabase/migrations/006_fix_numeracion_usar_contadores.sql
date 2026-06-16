-- ============================================================
-- 006 — Numeración consolidada en la propia tabla casetas
-- ============================================================
-- En vez de una tabla aparte (ticket_contadores) que hay que sincronizar a
-- mano cada vez que se crea una caseta, el prefijo y el contador viven en la
-- fila de la caseta. Así, al crear una caseta se pone su prefijo ahí mismo.
--   casetas.prefijo          -> p.ej. 'ALZ'  (3 letras)
--   casetas.contador_tickets -> correlativo continuo (ya añadido en la 005)
-- Resultado: ALZ-00031, ALZ-00032, ...
-- ============================================================

-- 1. Columna de prefijo en casetas
alter table casetas add column if not exists prefijo text;

-- 2. Rellenar el prefijo:
--    a) Si existe ticket_contadores, copiar su prefijo curado.
--    b) Si no, derivarlo del nombre (quitando 'Caballer ').
update casetas c
  set prefijo = tc.prefijo
  from ticket_contadores tc
  where tc.caseta_id = c.id and (c.prefijo is null or c.prefijo = '');

update casetas
  set prefijo = upper(left(regexp_replace(nombre, '^[Cc]aballer\s+', ''), 3))
  where prefijo is null or prefijo = '';

-- 3. Sincronizar el contador para que NO retroceda respecto a lo ya numerado
--    (toma el máximo entre el contador actual, el de ticket_contadores y el
--    nº real de tickets de la caseta).
update casetas c
  set contador_tickets = greatest(
        coalesce(c.contador_tickets, 0),
        coalesce((select tc.ultimo_num from ticket_contadores tc where tc.caseta_id = c.id), 0),
        (select count(*) from tickets t where t.caseta_id = c.id)
      );

-- 4. crear_ticket usa el prefijo + contador de la propia caseta (atómico)
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
  v_nombre    text;
  v_n         int;
  v_prefijo   text;
  v_numero    text;
begin
  -- Nombre del empleado (snapshot, para conservarlo si se borra el usuario)
  select nombre into v_nombre from perfiles where id = p_empleado_id;

  -- Correlativo atómico por caseta (bloquea la fila de la caseta)
  update casetas
    set contador_tickets = contador_tickets + 1
    where id = p_caseta_id
    returning contador_tickets,
              coalesce(nullif(prefijo, ''),
                       upper(left(regexp_replace(nombre, '^[Cc]aballer\s+', ''), 3)),
                       'TKT')
    into v_n, v_prefijo;

  v_numero := v_prefijo || '-' || lpad(v_n::text, 5, '0');

  insert into tickets (caja_id, caseta_id, empleado_id, empleado_nombre, metodo_pago, total, dinero_dado, cambio, numero_ticket)
  values (p_caja_id, p_caseta_id, p_empleado_id, v_nombre, p_metodo_pago, p_total, p_dinero_dado, p_cambio, v_numero)
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

    perform descontar_stock(
      (v_item->>'producto_id')::uuid,
      p_caseta_id,
      (v_item->>'cantidad')::int
    );
  end loop;

  return v_ticket_id;
end;
$$ language plpgsql security definer;

-- 5. Limpieza: ya no se usa el sistema antiguo
drop function if exists siguiente_numero_ticket(uuid);
drop table if exists ticket_contadores;
