-- ============================================================
-- LA PETARDERÍA TPV — Schema completo para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ============================================================
-- 1. EXTENSIONES
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- 2. TABLAS
-- ============================================================

-- Casetas (tiendas)
create table if not exists casetas (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Perfiles de usuario (extiende auth.users de Supabase)
create table if not exists perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         text not null check (rol in ('ADMIN','EMPLEADO')),
  caseta_id   uuid references casetas(id) on delete set null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Categorías de productos
create table if not exists categorias (
  id    serial primary key,
  nombre text not null unique
);

-- Productos
create table if not exists productos (
  id            uuid primary key default uuid_generate_v4(),
  nombre        text not null,
  precio        numeric(10,2) not null check (precio >= 0),
  categoria     text not null,
  edad_minima   int not null default 0,
  codigo_ean    text not null unique,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Stock por caseta
create table if not exists stock (
  id          uuid primary key default uuid_generate_v4(),
  producto_id uuid not null references productos(id) on delete cascade,
  caseta_id   uuid not null references casetas(id) on delete cascade,
  cantidad    int not null default 0 check (cantidad >= 0),
  updated_at  timestamptz not null default now(),
  unique(producto_id, caseta_id)
);

-- Ofertas (packs exactos)
-- Ejemplo: 4 unidades por 5€ exactos
create table if not exists ofertas (
  id            uuid primary key default uuid_generate_v4(),
  producto_id   uuid not null references productos(id) on delete cascade,
  etiqueta      text not null,           -- texto visible: "4 x 5€"
  cantidad_pack int not null check (cantidad_pack >= 2),
  precio_pack   numeric(10,2) not null check (precio_pack > 0),
  activa        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Sesiones de caja (por caseta, compartida entre empleados)
create table if not exists cajas (
  id              uuid primary key default uuid_generate_v4(),
  caseta_id       uuid not null references casetas(id) on delete cascade,
  abierta_por     uuid not null references perfiles(id),
  apertura_dinero numeric(10,2) not null default 0,
  abierta_en      timestamptz not null default now(),
  cerrada_en      timestamptz,
  cerrada_por     uuid references perfiles(id),
  dinero_contado  numeric(10,2),
  estado          text not null default 'ABIERTA' check (estado in ('ABIERTA','CERRADA')),
  -- Solo puede haber una caja abierta por caseta
  unique nulls not distinct (caseta_id, estado) -- Supabase >= 15, si falla usar trigger
);

-- Tickets de venta
create table if not exists tickets (
  id          uuid primary key default uuid_generate_v4(),
  caja_id     uuid not null references cajas(id) on delete cascade,
  caseta_id   uuid not null references casetas(id),
  empleado_id uuid not null references perfiles(id),
  metodo_pago text not null check (metodo_pago in ('efectivo','tarjeta')),
  total       numeric(10,2) not null,
  dinero_dado numeric(10,2),   -- solo efectivo
  cambio      numeric(10,2),   -- solo efectivo
  creado_en   timestamptz not null default now()
);

-- Líneas de ticket
create table if not exists ticket_items (
  id              uuid primary key default uuid_generate_v4(),
  ticket_id       uuid not null references tickets(id) on delete cascade,
  producto_id     uuid not null references productos(id),
  nombre_producto text not null,  -- snapshot del nombre en el momento de venta
  precio_unitario numeric(10,2) not null,
  cantidad        int not null check (cantidad > 0),
  total_linea     numeric(10,2) not null,
  con_oferta      boolean not null default false,
  detalle_oferta  text          -- ej: "2x pack 4x5€ + 1u normal"
);

-- ============================================================
-- 3. ÍNDICES
-- ============================================================
create index if not exists idx_stock_producto on stock(producto_id);
create index if not exists idx_stock_caseta on stock(caseta_id);
create index if not exists idx_tickets_caja on tickets(caja_id);
create index if not exists idx_tickets_caseta on tickets(caseta_id);
create index if not exists idx_tickets_fecha on tickets(creado_en desc);
create index if not exists idx_ofertas_producto on ofertas(producto_id);
create index if not exists idx_cajas_caseta_estado on cajas(caseta_id, estado);
create index if not exists idx_productos_ean on productos(codigo_ean);

-- ============================================================
-- 4. FUNCIÓN PARA ACTUALIZAR updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_productos_updated_at
  before update on productos
  for each row execute function update_updated_at();

create trigger trg_stock_updated_at
  before update on stock
  for each row execute function update_updated_at();

-- ============================================================
-- 5. FUNCIÓN PARA DESCONTAR STOCK (con bloqueo para concurrencia)
-- ============================================================
create or replace function descontar_stock(
  p_producto_id uuid,
  p_caseta_id   uuid,
  p_cantidad    int
) returns void as $$
declare
  v_stock int;
begin
  -- Bloqueo de fila para evitar stock negativo con múltiples dispositivos
  select cantidad into v_stock
  from stock
  where producto_id = p_producto_id and caseta_id = p_caseta_id
  for update;

  if v_stock is null then
    raise exception 'Producto no tiene stock registrado en esta caseta';
  end if;

  if v_stock < p_cantidad then
    raise exception 'Stock insuficiente: hay % unidades, se piden %', v_stock, p_cantidad;
  end if;

  update stock
  set cantidad = cantidad - p_cantidad
  where producto_id = p_producto_id and caseta_id = p_caseta_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 6. FUNCIÓN PARA CREAR TICKET COMPLETO (transacción atómica)
-- ============================================================
create or replace function crear_ticket(
  p_caja_id     uuid,
  p_caseta_id   uuid,
  p_empleado_id uuid,
  p_metodo_pago text,
  p_total       numeric,
  p_dinero_dado numeric,
  p_cambio      numeric,
  p_items       jsonb  -- array de {producto_id, nombre, precio_unitario, cantidad, total_linea, con_oferta, detalle_oferta}
) returns uuid as $$
declare
  v_ticket_id uuid;
  v_item      jsonb;
begin
  -- Crear ticket
  insert into tickets (caja_id, caseta_id, empleado_id, metodo_pago, total, dinero_dado, cambio)
  values (p_caja_id, p_caseta_id, p_empleado_id, p_metodo_pago, p_total, p_dinero_dado, p_cambio)
  returning id into v_ticket_id;

  -- Insertar líneas y descontar stock
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

    -- Descontar stock con bloqueo
    perform descontar_stock(
      (v_item->>'producto_id')::uuid,
      p_caseta_id,
      (v_item->>'cantidad')::int
    );
  end loop;

  return v_ticket_id;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 7. FUNCIÓN PARA VERIFICAR CAJA ABIERTA EN CASETA
-- ============================================================
create or replace function get_caja_abierta(p_caseta_id uuid)
returns setof cajas as $$
  select * from cajas
  where caseta_id = p_caseta_id and estado = 'ABIERTA'
  limit 1;
$$ language sql security definer;

-- ============================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table casetas enable row level security;
alter table perfiles enable row level security;
alter table productos enable row level security;
alter table stock enable row level security;
alter table ofertas enable row level security;
alter table cajas enable row level security;
alter table tickets enable row level security;
alter table ticket_items enable row level security;

-- Helper: obtener rol del usuario actual
create or replace function get_my_rol()
returns text as $$
  select rol from perfiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper: obtener caseta del usuario actual
create or replace function get_my_caseta()
returns uuid as $$
  select caseta_id from perfiles where id = auth.uid();
$$ language sql security definer stable;

-- CASETAS: todos los autenticados pueden leer
create policy "casetas_read" on casetas for select to authenticated using (true);
create policy "casetas_admin" on casetas for all to authenticated using (get_my_rol() = 'ADMIN');

-- PERFILES: cada uno lee el suyo, admin lee todos
create policy "perfiles_own" on perfiles for select to authenticated using (id = auth.uid());
create policy "perfiles_admin_read" on perfiles for select to authenticated using (get_my_rol() = 'ADMIN');
create policy "perfiles_admin_write" on perfiles for all to authenticated using (get_my_rol() = 'ADMIN');

-- PRODUCTOS: todos leen, solo admin escribe
create policy "productos_read" on productos for select to authenticated using (true);
create policy "productos_admin" on productos for all to authenticated using (get_my_rol() = 'ADMIN');

-- STOCK: todos leen, solo funciones internas escriben
create policy "stock_read" on stock for select to authenticated using (true);
create policy "stock_admin" on stock for all to authenticated using (get_my_rol() = 'ADMIN');

-- OFERTAS: todos leen, solo admin escribe
create policy "ofertas_read" on ofertas for select to authenticated using (true);
create policy "ofertas_admin" on ofertas for all to authenticated using (get_my_rol() = 'ADMIN');

-- CAJAS: empleados ven las de su caseta, admin ve todas
create policy "cajas_empleado" on cajas for select to authenticated
  using (caseta_id = get_my_caseta() or get_my_rol() = 'ADMIN');
create policy "cajas_insert" on cajas for insert to authenticated
  with check (caseta_id = get_my_caseta() or get_my_rol() = 'ADMIN');
create policy "cajas_update" on cajas for update to authenticated
  using (caseta_id = get_my_caseta() or get_my_rol() = 'ADMIN');

-- TICKETS: empleados ven los de su caseta, admin ve todos
create policy "tickets_read" on tickets for select to authenticated
  using (caseta_id = get_my_caseta() or get_my_rol() = 'ADMIN');
create policy "tickets_insert" on tickets for insert to authenticated
  with check (caseta_id = get_my_caseta() or get_my_rol() = 'ADMIN');

-- TICKET_ITEMS: a través de tickets
create policy "ticket_items_read" on ticket_items for select to authenticated
  using (
    exists (
      select 1 from tickets t
      where t.id = ticket_id
      and (t.caseta_id = get_my_caseta() or get_my_rol() = 'ADMIN')
    )
  );
create policy "ticket_items_insert" on ticket_items for insert to authenticated
  with check (true);  -- controlado por la función crear_ticket

-- ============================================================
-- 9. DATOS INICIALES — CASETAS
-- ============================================================
insert into casetas (id, nombre) values
  ('11111111-1111-1111-1111-111111111111', 'La Petardería Ruzafa'),
  ('22222222-2222-2222-2222-222222222222', 'La Petardería Massanassa'),
  ('33333333-3333-3333-3333-333333333333', 'La Petardería Cabañal'),
  ('44444444-4444-4444-4444-444444444444', 'La Petardería Alzira')
on conflict do nothing;

-- ============================================================
-- 10. DATOS INICIALES — PRODUCTOS (del catálogo real 2026)
-- ============================================================
insert into productos (id, nombre, precio, categoria, edad_minima, codigo_ean) values
  ('p0000001-0000-0000-0000-000000000001', 'Bombeta Japonesa 50u.', 1.00, 'Petardos', 12, '8410278001'),
  ('p0000001-0000-0000-0000-000000000002', 'Bombetas Grandes 50u.', 2.00, 'Petardos', 12, '8410278002'),
  ('p0000001-0000-0000-0000-000000000003', 'Mini Petardo 100u.', 1.50, 'Petardos', 16, '8410278003'),
  ('p0000001-0000-0000-0000-000000000004', 'Piratas 50u.', 1.00, 'Petardos', 16, '8410278004'),
  ('p0000001-0000-0000-0000-000000000005', 'Bucaneros 50u.', 1.50, 'Petardos', 16, '8410278005'),
  ('p0000001-0000-0000-0000-000000000006', 'Corsarios 50u.', 2.50, 'Petardos', 16, '8410278006'),
  ('p0000001-0000-0000-0000-000000000007', '100 Petardos 100u.', 1.50, 'Petardos', 16, '8410278007'),
  ('p0000001-0000-0000-0000-000000000008', 'Cobras 50u.', 2.50, 'Petardos', 16, '8410278008'),
  ('p0000001-0000-0000-0000-000000000009', 'Ninjas 100u.', 1.50, 'Petardos', 16, '8410278009'),
  ('p0000001-0000-0000-0000-000000000010', 'Supermasclet 25u.', 2.98, 'Petardos', 16, '8410278010'),
  ('p0000001-0000-0000-0000-000000000011', 'Granada Trueno 4u.', 5.50, 'Petardos', 16, '8410278011'),
  ('p0000001-0000-0000-0000-000000000012', 'Mega Masclet 20u.', 5.00, 'Petardos', 16, '8410278012'),
  ('p0000001-0000-0000-0000-000000000013', 'Kit Ninja', 4.50, 'Petardos', 16, '8410278013'),
  ('p0000001-0000-0000-0000-000000000014', 'Trueno Especial 8u.', 11.95, 'Truenos', 18, '8410278014'),
  ('p0000001-0000-0000-0000-000000000015', 'Trueno Gigante 5u.', 14.95, 'Truenos', 18, '8410278015'),
  ('p0000001-0000-0000-0000-000000000016', 'Traca 20 Petardos', 1.00, 'Truenos', 16, '8410278016'),
  ('p0000001-0000-0000-0000-000000000017', 'Traca 40 cobras', 1.50, 'Truenos', 18, '8410278017'),
  ('p0000001-0000-0000-0000-000000000018', 'Traca Saltarines', 1.00, 'Truenos', 16, '8410278018'),
  ('p0000001-0000-0000-0000-000000000019', 'Traca Mandarín', 1.00, 'Truenos', 16, '8410278019'),
  ('p0000001-0000-0000-0000-000000000020', 'Bengala Plumero 6u.', 2.50, 'Bengalas', 12, '8410278020'),
  ('p0000001-0000-0000-0000-000000000021', 'Chispitas 16cm. 10u.', 1.00, 'Bengalas', 12, '8410278021'),
  ('p0000001-0000-0000-0000-000000000022', 'Chispitas 30cm. 10u.', 2.00, 'Bengalas', 12, '8410278022'),
  ('p0000001-0000-0000-0000-000000000023', 'Chispitas 50cm. 10u.', 3.50, 'Bengalas', 12, '8410278023'),
  ('p0000001-0000-0000-0000-000000000024', 'Hypercolor 5u.', 3.50, 'Bengalas', 12, '8410278024'),
  ('p0000001-0000-0000-0000-000000000025', 'Coletas 6u.', 3.00, 'Cracker', 16, '8410278025'),
  ('p0000001-0000-0000-0000-000000000026', 'Canicas espaciales 6u.', 2.00, 'Cracker', 16, '8410278026'),
  ('p0000001-0000-0000-0000-000000000027', 'Cracker Bomba 12u.', 2.00, 'Cracker', 16, '8410278027'),
  ('p0000001-0000-0000-0000-000000000028', 'Crackeritos 50u.', 4.00, 'Cracker', 12, '8410278028'),
  ('p0000001-0000-0000-0000-000000000029', 'Gusanitos 10u.', 2.00, 'Terrestres', 16, '8410278029'),
  ('p0000001-0000-0000-0000-000000000030', 'Abeja Borracha 3u.', 1.50, 'Terrestres', 12, '8410278030'),
  ('p0000001-0000-0000-0000-000000000031', 'Payasitos 3u.', 1.50, 'Terrestres', 12, '8410278031'),
  ('p0000001-0000-0000-0000-000000000032', 'Ranas 4u.', 2.00, 'Terrestres', 16, '8410278032'),
  ('p0000001-0000-0000-0000-000000000033', 'Bomberitos 6u.', 3.00, 'Terrestres', 12, '8410278033'),
  ('p0000001-0000-0000-0000-000000000034', 'Mini F. Luminosa 4u.', 2.00, 'Fuentes', 12, '8410278034'),
  ('p0000001-0000-0000-0000-000000000035', 'Jarrón Chino 2u.', 3.50, 'Fuentes', 16, '8410278035'),
  ('p0000001-0000-0000-0000-000000000036', 'Fuente Fenix 1u.', 2.00, 'Fuentes', 16, '8410278036'),
  ('p0000001-0000-0000-0000-000000000037', 'Flower Power 3u.', 5.50, 'Fuentes', 16, '8410278037'),
  ('p0000001-0000-0000-0000-000000000038', 'Furia 1u.', 5.95, 'Fuentes', 16, '8410278038'),
  ('p0000001-0000-0000-0000-000000000039', 'Pyropack XXL', 44.99, 'Packs', 16, '8410278039'),
  ('p0000001-0000-0000-0000-000000000040', 'Maxi Mix Color', 25.99, 'Packs', 16, '8410278040'),
  ('p0000001-0000-0000-0000-000000000041', 'Maxi Mix Trueno', 19.99, 'Packs', 16, '8410278041'),
  ('p0000001-0000-0000-0000-000000000042', 'Destellos 12u.', 2.00, 'Efectos', 16, '8410278042'),
  ('p0000001-0000-0000-0000-000000000043', 'Fuchidors 10u.', 3.00, 'Efectos', 12, '8410278043'),
  ('p0000001-0000-0000-0000-000000000044', 'Magic Box 1u.', 1.75, 'Efectos', 16, '8410278044'),
  ('p0000001-0000-0000-0000-000000000045', 'Mecha Algodón 25cm.', 0.25, 'Accesorios', 0, '8410278045')
on conflict (codigo_ean) do nothing;

-- ============================================================
-- 11. DATOS INICIALES — STOCK (50 unidades por producto/caseta)
-- ============================================================
insert into stock (producto_id, caseta_id, cantidad)
select p.id, c.id, 50
from productos p cross join casetas c
on conflict (producto_id, caseta_id) do nothing;

-- Ajustar algunos stocks especiales
update stock set cantidad = 10 where producto_id = 'p0000001-0000-0000-0000-000000000039'; -- Pyropack XXL poco stock
update stock set cantidad = 200 where producto_id = 'p0000001-0000-0000-0000-000000000045'; -- Mechas mucho stock

-- ============================================================
-- 12. DATOS INICIALES — OFERTAS
-- ============================================================
insert into ofertas (producto_id, etiqueta, cantidad_pack, precio_pack) values
  ('p0000001-0000-0000-0000-000000000001', '5 x 3€',   5,  3.00),
  ('p0000001-0000-0000-0000-000000000002', '4 x 5€',   4,  5.00),
  ('p0000001-0000-0000-0000-000000000002', '10 x 10€', 10, 10.00),
  ('p0000001-0000-0000-0000-000000000004', '5 x 3€',   5,  3.00),
  ('p0000001-0000-0000-0000-000000000004', '4 x 5€',   4,  5.00),
  ('p0000001-0000-0000-0000-000000000008', '3 x 5€',   3,  5.00),
  ('p0000001-0000-0000-0000-000000000009', '2 x 2,50€',2,  2.50),
  ('p0000001-0000-0000-0000-000000000026', '3 x 5€',   3,  5.00),
  ('p0000001-0000-0000-0000-000000000027', '3 x 5€',   3,  5.00),
  ('p0000001-0000-0000-0000-000000000045', '5 x 1€',   5,  1.00)
on conflict do nothing;

-- ============================================================
-- ALERTAS TELEGRAM
-- ============================================================

create table if not exists alertas_config (
  tipo               text primary key,
  activa             boolean default true,
  modo_repeticion    text default 'una_vez',  -- 'una_vez' | 'repetir'
  cooldown_minutos   integer default 30,
  ultimo_envio       timestamptz
);

insert into alertas_config (tipo) values
  ('stock_bajo'),
  ('stock_agotado'),
  ('login_usuario'),
  ('fichaje'),
  ('nuevo_pedido'),
  ('inventario_enviado'),
  ('incidencia_pedido'),
  ('incidencia_ticket'),
  ('caja_cerrada_descuadre'),
  ('pedido_recibido'),
  ('limite_polvora')
on conflict do nothing;

alter table alertas_config enable row level security;
create policy alertas_config_admin on alertas_config
  using (exists (
    select 1 from perfiles where id = auth.uid() and rol = 'ADMIN'
  ))
  with check (exists (
    select 1 from perfiles where id = auth.uid() and rol = 'ADMIN'
  ));

-- Anti-spam por producto: evita repetir alertas de stock para el mismo producto
create table if not exists alertas_stock_enviadas (
  producto_id  uuid references productos(id) on delete cascade,
  caseta_id    uuid references casetas(id)   on delete cascade,
  tipo         text,  -- 'stock_bajo' | 'stock_agotado'
  enviado_en   timestamptz default now(),
  primary key (producto_id, caseta_id, tipo)
);

alter table alertas_stock_enviadas enable row level security;
create policy alertas_stock_log_service on alertas_stock_enviadas
  using (true) with check (true);

-- ============================================================
-- FIN DEL SCHEMA
-- SIGUIENTE PASO: Crear usuarios desde Supabase Dashboard
-- Authentication > Users > Invite user
-- Luego ejecutar el INSERT de perfiles de abajo con los UUIDs reales
-- ============================================================

-- PLANTILLA para añadir perfil tras crear usuario en Auth:
-- insert into perfiles (id, nombre, rol, caseta_id) values
--   ('<UUID-del-usuario>', 'Admin Principal', 'ADMIN', null),
--   ('<UUID-empleado>',    'Maria Garcia',    'EMPLEADO', '11111111-1111-1111-1111-111111111111');
