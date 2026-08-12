-- ============================================================
-- 012_edicion_tickets_empleado.sql
-- Los empleados pueden EDITAR tickets siempre.
-- BORRAR un ticket solo si el empleado está autorizado (permiso por empleado).
-- Un ticket editado NO puede quedar vacío ni a 0 €.
-- Toda edición/borrado queda registrada para revisión del administrador.
-- ============================================================

-- 1) Permiso por empleado para borrar tickets
alter table perfiles
  add column if not exists puede_borrar_tickets boolean not null default false;

-- 2) Tabla de auditoría de cambios en tickets
create table if not exists ticket_auditoria (
  id            uuid primary key default uuid_generate_v4(),
  ticket_id     uuid,                 -- sin FK: el ticket puede haberse borrado
  numero_ticket text,
  caseta_id     uuid references casetas(id) on delete set null,
  perfil_id     uuid references perfiles(id) on delete set null,
  accion        text not null check (accion in ('EDITAR','BORRAR')),
  total_antes   numeric,
  total_despues numeric,
  items_antes   jsonb,
  items_despues jsonb,
  creado_en     timestamptz not null default now()
);
create index if not exists idx_ticket_audit_caseta on ticket_auditoria(caseta_id, creado_en desc);

alter table ticket_auditoria enable row level security;
drop policy if exists "audit_admin_read" on ticket_auditoria;
create policy "audit_admin_read" on ticket_auditoria
  for select to authenticated using (get_my_rol() = 'ADMIN');

-- 3) Helper: snapshot de las líneas actuales de un ticket
create or replace function _snapshot_ticket_items(p_ticket_id uuid)
returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'producto_id',     producto_id,
    'nombre_producto', nombre_producto,
    'precio_unitario', precio_unitario,
    'cantidad',        cantidad,
    'total_linea',     total_linea
  )), '[]'::jsonb)
  from ticket_items where ticket_id = p_ticket_id;
$$ language sql security definer;

-- ============================================================
-- 4) CANCELAR TICKET — ahora con permiso + auditoría
-- ============================================================
create or replace function cancelar_ticket(p_ticket_id uuid)
returns void as $$
declare
  v_caseta_id uuid;
  v_total     numeric;
  v_numero    text;
  v_item      record;
  v_puede     boolean;
begin
  select caseta_id, total, numero_ticket
    into v_caseta_id, v_total, v_numero
    from tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket no encontrado';
  end if;

  -- Permiso: el ADMIN siempre puede; el empleado solo si está autorizado
  if get_my_rol() <> 'ADMIN' then
    select coalesce(puede_borrar_tickets, false) into v_puede
      from perfiles where id = auth.uid();
    if not coalesce(v_puede, false) then
      raise exception 'No tienes permiso para borrar tickets. Pide a un encargado autorizado o crea una incidencia.';
    end if;
  end if;

  -- Auditoría (antes de borrar, para conservar las líneas)
  insert into ticket_auditoria
    (ticket_id, numero_ticket, caseta_id, perfil_id, accion, total_antes, total_despues, items_antes, items_despues)
  values
    (p_ticket_id, v_numero, v_caseta_id, auth.uid(), 'BORRAR', v_total, null, _snapshot_ticket_items(p_ticket_id), null);

  -- Devolver stock de cada línea
  for v_item in
    select producto_id, cantidad from ticket_items where ticket_id = p_ticket_id
  loop
    update stock
    set cantidad = cantidad + v_item.cantidad
    where producto_id = v_item.producto_id and caseta_id = v_caseta_id;
  end loop;

  -- Borrar ticket (cascade elimina ticket_items)
  delete from tickets where id = p_ticket_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 5) ACTUALIZAR TICKET — no puede quedar vacío/0 + auditoría
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

  -- Actualizar total del ticket
  update tickets set total = p_nuevo_total where id = p_ticket_id;

  -- Auditoría (después del cambio)
  insert into ticket_auditoria
    (ticket_id, numero_ticket, caseta_id, perfil_id, accion, total_antes, total_despues, items_antes, items_despues)
  values
    (p_ticket_id, v_numero, v_caseta_id, auth.uid(), 'EDITAR', v_total_ant, p_nuevo_total, v_items_ant, p_nuevos_items);
end;
$$ language plpgsql security definer;
