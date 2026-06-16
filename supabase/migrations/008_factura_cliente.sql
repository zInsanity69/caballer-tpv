-- ============================================================
-- 008 — Guardar datos de factura (cliente) en el ticket
-- ============================================================
-- Permite reimprimir la factura más tarde (desde el historial del empleado o
-- desde el panel de admin) con los datos del cliente que se metieron al venderla.
-- ============================================================

alter table tickets add column if not exists factura          boolean not null default false;
alter table tickets add column if not exists cliente_nombre    text;
alter table tickets add column if not exists cliente_cif       text;
alter table tickets add column if not exists cliente_direccion text;
