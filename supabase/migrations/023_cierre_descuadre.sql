-- ============================================================
-- 023_cierre_descuadre.sql
-- Guarda el esperado y el descuadre en el cierre de caja, para poder
-- revisarlos después en el panel de "Cierres" del admin sin recalcular
-- las ventas de cada caja.
-- ============================================================

alter table cajas add column if not exists esperado  numeric(10,2);
alter table cajas add column if not exists descuadre numeric(10,2);
