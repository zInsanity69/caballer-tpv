-- ============================================================
-- 016_caseta_activo.sql
-- Estado activo/inactivo por caseta (punto de venta). Las casetas
-- inactivas (cerradas fuera de temporada) no cuentan en las alertas
-- de stock del panel, para no inflar el "stock bajo/agotado".
-- ============================================================

alter table casetas add column if not exists activo boolean not null default true;
