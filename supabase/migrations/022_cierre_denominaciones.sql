-- ============================================================
-- 022_cierre_denominaciones.sql
-- Rediseño del cierre de caja: conteo por denominaciones (sin máquina de contar)
-- y cálculo del "sobre" (billetes que se depositan) y el "cambio" (fondo que se
-- queda para el día siguiente, normalmente las monedas + billetes retenidos).
--
-- El cambio que se deja al cerrar = la apertura del día siguiente (se hereda,
-- el front lo sugiere al abrir la caja).
-- ============================================================

alter table cajas add column if not exists desglose_efectivo jsonb;   -- { "50": 3, "20": 5, "0.50": 12, ... }
alter table cajas add column if not exists total_billetes    numeric(10,2);
alter table cajas add column if not exists total_monedas      numeric(10,2);
alter table cajas add column if not exists cambio_dejado      numeric(10,2);  -- fondo que se queda (apertura de mañana)
alter table cajas add column if not exists sobre              numeric(10,2);  -- billetes depositados
