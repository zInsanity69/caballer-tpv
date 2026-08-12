-- ============================================================
-- 015_encargado_inventario_final_stock.sql
--   1) Inventario final: vacía el stock de la caseta al confirmarlo.
--   2) Permiso "Encargado" (sustituye a puede_borrar_tickets): borrar
--      tickets + ajustar stock. Editar tickets sigue libre para todos.
--   3) Ajuste de stock auditado (con registro de quién/cuándo/de→a).
-- ============================================================

-- ─── 1) INVENTARIO FINAL ──────────────────────────────────────
alter table inventarios add column if not exists es_final boolean not null default false;

-- Confirmar un inventario final: pone a 0 TODO el stock de la caseta.
-- Los recuentos quedan guardados en inventario_items (registro de lo devuelto).
-- No toca aplicar_inventario (el normal) para no arriesgar ese flujo.
create or replace function aplicar_inventario_final(p_inventario_id uuid)
returns void as $$
declare
  v_caseta uuid;
begin
  select caseta_id into v_caseta from inventarios where id = p_inventario_id;
  if not found then
    raise exception 'Inventario no encontrado';
  end if;

  update stock set cantidad = 0, updated_at = now() where caseta_id = v_caseta;
  update inventarios set estado = 'CONFIRMADO' where id = p_inventario_id;
end;
$$ language plpgsql security definer;

-- ─── 2) PERMISO "ENCARGADO" ───────────────────────────────────
alter table perfiles add column if not exists es_encargado boolean not null default false;

-- Hereda del permiso antiguo (quien podía borrar pasa a encargado)
update perfiles set es_encargado = true where puede_borrar_tickets = true;

-- cancelar_ticket ahora comprueba es_encargado (idéntico a la 012 salvo eso)
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

  if get_my_rol() <> 'ADMIN' then
    select coalesce(es_encargado, false) into v_puede
      from perfiles where id = auth.uid();
    if not coalesce(v_puede, false) then
      raise exception 'No tienes permiso para borrar tickets. Pide a un encargado autorizado o crea una incidencia.';
    end if;
  end if;

  insert into ticket_auditoria
    (ticket_id, numero_ticket, caseta_id, perfil_id, accion, total_antes, total_despues, items_antes, items_despues)
  values
    (p_ticket_id, v_numero, v_caseta_id, auth.uid(), 'BORRAR', v_total, null, _snapshot_ticket_items(p_ticket_id), null);

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

-- Ya no se usa el permiso antiguo
alter table perfiles drop column if exists puede_borrar_tickets;

-- ─── 3) AJUSTE DE STOCK AUDITADO ──────────────────────────────
create table if not exists stock_auditoria (
  id               uuid primary key default uuid_generate_v4(),
  caseta_id        uuid references casetas(id) on delete set null,
  producto_id      uuid references productos(id) on delete set null,
  nombre_producto  text,
  perfil_id        uuid references perfiles(id) on delete set null,
  cantidad_antes   int,
  cantidad_despues int,
  motivo           text,
  creado_en        timestamptz not null default now()
);
create index if not exists idx_stock_audit_caseta on stock_auditoria(caseta_id, creado_en desc);

alter table stock_auditoria enable row level security;
drop policy if exists "stock_audit_admin_read" on stock_auditoria;
create policy "stock_audit_admin_read" on stock_auditoria
  for select to authenticated using (get_my_rol() = 'ADMIN');

-- Ajusta el stock (delta) y deja registro. ADMIN cualquier caseta; encargado
-- solo la suya. El motivo es opcional.
create or replace function ajustar_stock_auditado(
  p_producto_id uuid,
  p_caseta_id   uuid,
  p_delta       int,
  p_motivo      text default null
) returns int as $$
declare
  v_antes   int;
  v_despues int;
  v_nombre  text;
begin
  if get_my_rol() <> 'ADMIN' then
    if not coalesce((select es_encargado from perfiles where id = auth.uid()), false) then
      raise exception 'No tienes permiso para ajustar stock';
    end if;
    if p_caseta_id <> get_my_caseta() then
      raise exception 'Solo puedes ajustar el stock de tu caseta';
    end if;
  end if;

  select cantidad into v_antes from stock where producto_id = p_producto_id and caseta_id = p_caseta_id;
  v_antes   := coalesce(v_antes, 0);
  v_despues := greatest(0, v_antes + p_delta);

  insert into stock (producto_id, caseta_id, cantidad)
  values (p_producto_id, p_caseta_id, v_despues)
  on conflict (producto_id, caseta_id)
  do update set cantidad = excluded.cantidad, updated_at = now();

  select nombre into v_nombre from productos where id = p_producto_id;

  insert into stock_auditoria (caseta_id, producto_id, nombre_producto, perfil_id, cantidad_antes, cantidad_despues, motivo)
  values (p_caseta_id, p_producto_id, v_nombre, auth.uid(), v_antes, v_despues, nullif(trim(p_motivo), ''));

  return v_despues;
end;
$$ language plpgsql security definer;
