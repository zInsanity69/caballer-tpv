-- ============================================================
-- 014_pago_mixto.sql
-- Permite cobrar un ticket en parte efectivo y parte tarjeta.
-- Cada ticket guarda cuánto se pagó en efectivo y cuánto en tarjeta,
-- así el cierre y el dashboard cuadran sumando importes (no métodos).
-- ============================================================

-- 1) Reparto por ticket
alter table tickets add column if not exists pago_efectivo numeric(10,2) not null default 0;
alter table tickets add column if not exists pago_tarjeta  numeric(10,2) not null default 0;

-- 2) Permitir el método 'mixto'
alter table tickets drop constraint if exists tickets_metodo_pago_check;
alter table tickets add constraint tickets_metodo_pago_check
  check (metodo_pago in ('efectivo','tarjeta','mixto'));

-- 3) Rellenar tickets existentes según su método (idempotente)
update tickets set pago_efectivo = total
  where metodo_pago = 'efectivo' and pago_efectivo = 0 and pago_tarjeta = 0;
update tickets set pago_tarjeta = total
  where metodo_pago = 'tarjeta'  and pago_efectivo = 0 and pago_tarjeta = 0;

-- 4) crear_ticket con el reparto (mantiene la numeración por caseta de la 006).
--    Los dos parámetros nuevos son opcionales: si no llegan, se derivan del
--    método (compatibilidad con cualquier llamada antigua).
drop function if exists crear_ticket(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb);
create or replace function crear_ticket(
  p_caja_id       uuid,
  p_caseta_id     uuid,
  p_empleado_id   uuid,
  p_metodo_pago   text,
  p_total         numeric,
  p_dinero_dado   numeric,
  p_cambio        numeric,
  p_items         jsonb,
  p_pago_efectivo numeric default null,
  p_pago_tarjeta  numeric default null
) returns uuid as $$
declare
  v_ticket_id uuid;
  v_item      jsonb;
  v_nombre    text;
  v_n         int;
  v_prefijo   text;
  v_numero    text;
  v_ef        numeric := coalesce(p_pago_efectivo, case when p_metodo_pago = 'efectivo' then p_total else 0 end);
  v_ta        numeric := coalesce(p_pago_tarjeta,  case when p_metodo_pago = 'tarjeta'  then p_total else 0 end);
begin
  -- Nombre del empleado (snapshot)
  select nombre into v_nombre from perfiles where id = p_empleado_id;

  -- Correlativo atómico por caseta
  update casetas
    set contador_tickets = contador_tickets + 1
    where id = p_caseta_id
    returning contador_tickets,
              coalesce(nullif(prefijo, ''),
                       upper(left(regexp_replace(nombre, '^[Cc]aballer\s+', ''), 3)),
                       'TKT')
    into v_n, v_prefijo;

  v_numero := v_prefijo || '-' || lpad(v_n::text, 5, '0');

  insert into tickets (caja_id, caseta_id, empleado_id, empleado_nombre, metodo_pago, total, dinero_dado, cambio, numero_ticket, pago_efectivo, pago_tarjeta)
  values (p_caja_id, p_caseta_id, p_empleado_id, v_nombre, p_metodo_pago, p_total, p_dinero_dado, p_cambio, v_numero, v_ef, v_ta)
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
