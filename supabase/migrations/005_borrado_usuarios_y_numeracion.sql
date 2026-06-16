-- ============================================================
-- 005 — Borrado de usuarios (conservando nombre) + numeración de tiques
-- ============================================================
-- Objetivos:
--  1. Permitir BORRAR un perfil sin chocar con las FKs del histórico
--     (cajas/tickets/retiradas/fichajes/...). Se pasan TODAS las FKs que
--     apuntan a perfiles a ON DELETE SET NULL.
--  2. Conservar el NOMBRE del empleado en el histórico aunque se borre el
--     usuario, mediante columnas snapshot *_nombre rellenadas por triggers
--     y por la RPC crear_ticket.
--  3. Numerar los tiques con sentido: <3 letras distintivas de la caseta>-<correlativo>
--     p.ej. "Caballer Alzira" -> ALZ-0001, ALZ-0002, ... (continuo por caseta).
-- ============================================================

-- ── 1. Columnas snapshot de nombre ──────────────────────────
alter table tickets        add column if not exists empleado_nombre   text;
alter table tickets        add column if not exists numero_ticket     text;
alter table cajas          add column if not exists abierta_por_nombre text;
alter table cajas          add column if not exists cerrada_por_nombre text;
alter table retiradas_caja add column if not exists empleado_nombre   text;

-- Contador de tiques por caseta (correlativo continuo)
alter table casetas add column if not exists contador_tickets int not null default 0;

-- ── 2. Backfill de los nombres actuales ─────────────────────
update tickets        t set empleado_nombre    = p.nombre from perfiles p where t.empleado_id  = p.id and t.empleado_nombre    is null;
update cajas          c set abierta_por_nombre  = p.nombre from perfiles p where c.abierta_por  = p.id and c.abierta_por_nombre  is null;
update cajas          c set cerrada_por_nombre  = p.nombre from perfiles p where c.cerrada_por  = p.id and c.cerrada_por_nombre  is null;
update retiradas_caja r set empleado_nombre     = p.nombre from perfiles p where r.empleado_id  = p.id and r.empleado_nombre     is null;

-- Sembrar el contador con el nº de tickets ya existentes por caseta
update casetas set contador_tickets = (select count(*) from tickets t where t.caseta_id = casetas.id);

-- ── 3. Triggers que rellenan el snapshot al crear/cerrar ────
create or replace function snapshot_caja_nombres() returns trigger as $$
begin
  if new.abierta_por is not null then
    select nombre into new.abierta_por_nombre from perfiles where id = new.abierta_por;
  end if;
  if new.cerrada_por is not null then
    select nombre into new.cerrada_por_nombre from perfiles where id = new.cerrada_por;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_snapshot_caja on cajas;
create trigger trg_snapshot_caja before insert or update on cajas
  for each row execute function snapshot_caja_nombres();

create or replace function snapshot_retirada_nombre() returns trigger as $$
begin
  if new.empleado_id is not null then
    select nombre into new.empleado_nombre from perfiles where id = new.empleado_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_snapshot_retirada on retiradas_caja;
create trigger trg_snapshot_retirada before insert on retiradas_caja
  for each row execute function snapshot_retirada_nombre();

-- ── 4. crear_ticket: snapshot de nombre + número con sentido ─
-- (Basada en 003_fix_crear_ticket_stock.sql, conservando el descuento de stock)
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
  -- Nombre del empleado (snapshot)
  select nombre into v_nombre from perfiles where id = p_empleado_id;

  -- Correlativo atómico por caseta (bloquea la fila de la caseta)
  update casetas
    set contador_tickets = contador_tickets + 1
    where id = p_caseta_id
    returning contador_tickets,
              upper(left(regexp_replace(nombre, '^[Cc]aballer\s+', ''), 3))
    into v_n, v_prefijo;

  v_numero := coalesce(nullif(v_prefijo, ''), 'TKT') || '-' || lpad(v_n::text, 4, '0');

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

-- ── 5. Todas las FKs que apuntan a perfiles -> ON DELETE SET NULL ─
-- Recorre dinámicamente pg_constraint para cubrir también tablas creadas
-- fuera del repo (fichajes/pedidos/inventarios/...).
do $$
declare
  r record;
begin
  for r in
    select c.conname,
           c.conrelid::regclass::text as tbl,
           a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'perfiles'::regclass
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references perfiles(id) on delete set null',
      r.tbl, r.conname, r.col
    );
  end loop;
end;
$$;
