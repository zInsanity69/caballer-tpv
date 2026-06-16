-- ============================================================
-- 009 — Categorías como lista maestra (tabla categorias)
-- ============================================================
-- La tabla `categorias` (id serial, nombre unique) estaba vacía y sin usar.
-- Pasa a ser la lista oficial de categorías: el formulario de producto elige
-- de aquí y hay una pantalla de gestión (crear/renombrar/borrar) en admin.
-- Los productos siguen guardando el nombre en productos.categoria (texto);
-- renombrar una categoría hace un UPDATE masivo de los productos.
-- ============================================================

-- 1. Sembrar con las categorías que ya usan los productos + las estándar
insert into categorias (nombre)
  select distinct categoria from productos
  where categoria is not null and trim(categoria) <> ''
  on conflict (nombre) do nothing;

insert into categorias (nombre) values
  ('Petardos'),('Truenos'),('Bengalas'),('Cracker'),('Terrestres'),
  ('Fuentes'),('Efectos'),('Packs'),('Accesorios')
  on conflict (nombre) do nothing;

-- 2. Permisos (RLS): lectura para usuarios logueados, escritura solo ADMIN
alter table categorias enable row level security;
drop policy if exists categorias_read on categorias;
create policy categorias_read on categorias for select to authenticated using (true);
drop policy if exists categorias_admin on categorias;
create policy categorias_admin on categorias for all to authenticated using (get_my_rol() = 'ADMIN');
