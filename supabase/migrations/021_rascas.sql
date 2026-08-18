-- ============================================================
-- 021_rascas.sql
-- Rascas (tarjetas rasca-y-gana) que se regalan con la compra.
-- Al rascar aparece un EAN (uno por premio). Escanear ese EAN en caja añade
-- el producto premiado como REGALO (precio 0, descuenta stock).
--
-- Esta tabla es solo el mapeo EAN del rasca -> producto premiado. Son pocas
-- filas (una por premio posible). NO son productos nuevos: el premio es un
-- producto que ya existe en el catálogo (por eso apuntamos a productos.id).
-- El EAN del rasca es DISTINTO del EAN normal del producto premiado.
-- ============================================================

create table if not exists rascas (
  id          uuid primary key default uuid_generate_v4(),
  ean         text not null unique,
  producto_id uuid not null references productos(id) on delete cascade,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table rascas enable row level security;

-- Todos los autenticados leen (el empleado necesita el mapeo al escanear);
-- solo ADMIN escribe.
drop policy if exists "rascas_read"  on rascas;
drop policy if exists "rascas_admin" on rascas;
create policy "rascas_read"  on rascas for select to authenticated using (true);
create policy "rascas_admin" on rascas for all    to authenticated using (get_my_rol() = 'ADMIN');
