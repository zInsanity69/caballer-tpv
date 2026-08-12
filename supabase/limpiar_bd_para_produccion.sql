-- ============================================================
-- LIMPIAR LA BASE DE DATOS PARA EMPEZAR A VENDER (PRODUCCIÓN)
-- ============================================================
-- MANTIENE (no toca):
--   · productos        (catálogo)
--   · ofertas          (promociones)
--   · perfiles         (usuarios: empleados y administradores)
--   · casetas          (puntos de venta; solo se reinicia su contador de tickets)
--   · categorias       (lista maestra de categorías)
--   · alertas_config   (qué alertas de Telegram están activas)
--
-- BORRA todo lo operativo/de venta:
--   tickets, cajas, retiradas, fichajes, pedidos, inventarios,
--   devoluciones/defectuosos, auditorías (Cambios), avisos de stock
--   enviados y el STOCK entero (empiezas a 0).
--
-- Además reinicia la numeración de tickets: el primero de cada caseta será 00001.
--
-- ⚠️  ACCIÓN IRREVERSIBLE. Si puedes, haz un backup del proyecto antes
--     (Supabase → Database → Backups) y ejecuta esto de una sola vez.
-- ============================================================

begin;

-- ── Auditorías (pestaña «Cambios») ──
delete from stock_auditoria;
delete from ticket_auditoria;

-- ── Devoluciones / compensaciones / bajas (Defectuosos) ──
delete from devolucion_items;
delete from devoluciones;

-- ── Inventarios ──
delete from inventario_items;
delete from inventarios;

-- ── Pedidos ──
delete from pedido_items;
delete from pedidos;

-- ── Ventas ──
delete from ticket_items;
delete from tickets;

-- ── Caja ──
delete from retiradas_caja;
delete from cajas;

-- ── Fichajes ──
delete from fichajes;

-- ── Avisos de stock ya enviados (para que vuelvan a avisar cuando toque) ──
delete from alertas_stock_enviadas;

-- ── Stock (borrado completo: se empieza a 0) ──
delete from stock;

-- ── Tabla temporal de la demo, por si quedó ──
drop table if exists _demo_stock_backup;

-- ── Reiniciar la numeración de tickets de todas las casetas ──
update casetas set contador_tickets = 0;

commit;

-- Comprobación rápida (opcional): deben salir a 0 salvo lo que se mantiene.
-- select
--   (select count(*) from tickets)      as tickets,
--   (select count(*) from cajas)        as cajas,
--   (select count(*) from fichajes)     as fichajes,
--   (select count(*) from pedidos)      as pedidos,
--   (select count(*) from inventarios)  as inventarios,
--   (select count(*) from devoluciones) as devoluciones,
--   (select count(*) from stock)        as stock,
--   (select count(*) from productos)    as productos_MANTENIDOS,
--   (select count(*) from ofertas)      as ofertas_MANTENIDAS,
--   (select count(*) from perfiles)     as usuarios_MANTENIDOS,
--   (select count(*) from casetas)      as casetas_MANTENIDAS;
