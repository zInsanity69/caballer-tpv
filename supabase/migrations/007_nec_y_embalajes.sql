-- ============================================================
-- 007 — División de riesgo (NEC) + embalajes en productos
-- ============================================================
--  productos.division         -> '1.1G','1.2G','1.3G','1.4G','1.4S' o NULL (sin clasificar)
--  productos.fardo            -> (YA EXISTE) uds de venta por ENVASE
--  productos.envases_por_caja -> cuántos envases trae una caja de almacén
--
--  Jerarquía de pedido:  unidad de venta  →  envase (= fardo unidades)
--                        →  caja de almacén (= envases_por_caja envases)
--  El NEC (gramos_polvora) es por UNIDAD DE VENTA (p.ej. la caja de 100 chinos
--  es 1 unidad; baterías/fuentes son 1 unidad cada una).
-- ============================================================

alter table productos add column if not exists division        text;
alter table productos add column if not exists envases_por_caja int;
