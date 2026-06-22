-- ============================================================
-- 010 — EAN ya no es único (variantes de color + colisiones de proveedor)
-- ============================================================
-- Los fabricantes reutilizan el mismo EAN en varias variantes de color, y
-- petardos de proveedores distintos pueden compartir EAN por azar. Por tanto
-- un EAN puede corresponder a VARIOS productos. Quitamos la restricción UNIQUE
-- de productos.codigo_ean (el EAN sigue siendo obligatorio: mantenemos NOT NULL)
-- y lo sustituimos por un índice NO único para que la búsqueda siga siendo rápida.
-- El escáner muestra un panel para elegir cuando un EAN coincide con varios.
-- ============================================================

-- 1. Quitar la restricción UNIQUE generada por el `UNIQUE` inline de la 001.
alter table productos drop constraint if exists productos_codigo_ean_key;

-- 2. Por si en algún entorno quedó como índice único independiente.
drop index if exists productos_codigo_ean_key;

-- 3. Índice no único para mantener rápida la búsqueda por EAN.
create index if not exists idx_productos_codigo_ean on productos(codigo_ean);
