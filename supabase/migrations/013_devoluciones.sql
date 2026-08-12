-- ============================================================
-- 013_devoluciones.sql
-- Devoluciones (reembolso), compensaciones por defectuoso (0€) y
-- bajas/roturas internas de producto. Control de defectuosos por
-- proveedor para reclamar al fabricante.
-- ============================================================

-- 1) Cabecera de cada movimiento
create table if not exists devoluciones (
  id                  uuid primary key default uuid_generate_v4(),
  caseta_id           uuid not null references casetas(id) on delete cascade,
  caja_id             uuid references cajas(id) on delete set null,
  empleado_id         uuid references perfiles(id) on delete set null,
  tipo                text not null check (tipo in ('DEVOLUCION','COMPENSACION','BAJA')),
  ticket_id           uuid references tickets(id) on delete set null,
  numero_ticket       text,
  importe_reembolsado numeric(10,2) not null default 0,
  metodo              text not null default 'efectivo',
  notas               text,
  creado_en           timestamptz not null default now()
);
create index if not exists idx_devoluciones_caseta on devoluciones(caseta_id, creado_en desc);

-- 2) Líneas del movimiento
--   movimiento:
--     DEVUELTO_VENDIBLE   → el cliente devuelve algo en buen estado → vuelve a stock vendible
--     DEVUELTO_DEFECTUOSO → el cliente devuelve algo roto → no vuelve a vendible (defectuoso)
--     ENTREGADO           → producto que se entrega (compensación) → sale de vendible
--     BAJA                → rotura/defecto interno antes de vender → sale de vendible (defectuoso)
--   causa (solo defectuosos): FABRICA (reclamable al proveedor) | PROPIA (merma nuestra)
--   reclamacion (solo defectuosos de fábrica): PENDIENTE | RECLAMADO | ABONADO
create table if not exists devolucion_items (
  id              uuid primary key default uuid_generate_v4(),
  devolucion_id   uuid not null references devoluciones(id) on delete cascade,
  producto_id     uuid references productos(id) on delete set null,
  nombre_producto text,
  empresa         text,
  cantidad        int not null check (cantidad > 0),
  precio_unitario numeric(10,2),
  movimiento      text not null check (movimiento in ('DEVUELTO_VENDIBLE','DEVUELTO_DEFECTUOSO','ENTREGADO','BAJA')),
  causa           text check (causa in ('FABRICA','PROPIA')),
  reclamacion     text not null default 'PENDIENTE' check (reclamacion in ('PENDIENTE','RECLAMADO','ABONADO'))
);
create index if not exists idx_devolucion_items_dev on devolucion_items(devolucion_id);
create index if not exists idx_devolucion_items_mov on devolucion_items(movimiento);

-- 3) RLS
alter table devoluciones enable row level security;
drop policy if exists "dev_admin_all" on devoluciones;
drop policy if exists "dev_emp_read"  on devoluciones;
create policy "dev_admin_all" on devoluciones for all to authenticated
  using (get_my_rol() = 'ADMIN') with check (get_my_rol() = 'ADMIN');
create policy "dev_emp_read" on devoluciones for select to authenticated
  using (caseta_id = get_my_caseta());

alter table devolucion_items enable row level security;
drop policy if exists "devit_admin_all" on devolucion_items;
drop policy if exists "devit_emp_read"  on devolucion_items;
create policy "devit_admin_all" on devolucion_items for all to authenticated
  using (get_my_rol() = 'ADMIN') with check (get_my_rol() = 'ADMIN');
create policy "devit_emp_read" on devolucion_items for select to authenticated
  using (exists (select 1 from devoluciones d where d.id = devolucion_id and d.caseta_id = get_my_caseta()));

-- 4) RPC: registrar un movimiento (ajusta stock y, si hay reembolso en
--    efectivo, lo saca de la caja como retirada para que cuadre el cierre)
create or replace function registrar_devolucion(p_cab jsonb, p_items jsonb)
returns uuid as $$
declare
  v_id      uuid;
  v_caseta  uuid := (p_cab->>'caseta_id')::uuid;
  v_caja    uuid := nullif(p_cab->>'caja_id','')::uuid;
  v_emp     uuid := auth.uid();
  v_tipo    text := p_cab->>'tipo';
  v_importe numeric := coalesce((p_cab->>'importe_reembolsado')::numeric, 0);
  v_metodo  text := coalesce(p_cab->>'metodo','efectivo');
  v_numero  text := p_cab->>'numero_ticket';
  v_it      jsonb;
  v_mov     text;
  v_cant    int;
  v_prod    uuid;
begin
  if v_caseta is null then
    raise exception 'Falta la caseta';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos en el movimiento';
  end if;

  insert into devoluciones (caseta_id, caja_id, empleado_id, tipo, ticket_id, numero_ticket, importe_reembolsado, metodo, notas)
  values (v_caseta, v_caja, v_emp, v_tipo,
          nullif(p_cab->>'ticket_id','')::uuid, v_numero, v_importe, v_metodo, p_cab->>'notas')
  returning id into v_id;

  for v_it in select * from jsonb_array_elements(p_items)
  loop
    v_mov  := v_it->>'movimiento';
    v_cant := (v_it->>'cantidad')::int;
    v_prod := nullif(v_it->>'producto_id','')::uuid;

    insert into devolucion_items (devolucion_id, producto_id, nombre_producto, empresa, cantidad, precio_unitario, movimiento, causa)
    values (v_id, v_prod, v_it->>'nombre_producto', nullif(v_it->>'empresa',''), v_cant,
            nullif(v_it->>'precio_unitario','')::numeric, v_mov, nullif(v_it->>'causa',''));

    if v_prod is not null then
      if v_mov = 'DEVUELTO_VENDIBLE' then
        perform ajustar_stock(v_prod, v_caseta, v_cant);
      elsif v_mov in ('ENTREGADO','BAJA') then
        perform ajustar_stock(v_prod, v_caseta, -v_cant);
      end if;
      -- DEVUELTO_DEFECTUOSO no toca el stock vendible
    end if;
  end loop;

  -- El reembolso en efectivo NO se registra como retirada: se guarda en la
  -- propia devolución (importe_reembolsado/metodo) y el cierre lo resta aparte,
  -- así "Devoluciones" y "Retiradas" no se mezclan.

  return v_id;
end;
$$ language plpgsql security definer;

-- 5) Alertas Telegram
insert into alertas_config (tipo) values ('devolucion')    on conflict do nothing;
insert into alertas_config (tipo) values ('baja_producto') on conflict do nothing;
