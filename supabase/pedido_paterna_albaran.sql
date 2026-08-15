-- ============================================================
-- Carga del pedido de PATERNA desde el albaran Platon AS-2026-0058
-- (Fecha 12/08/2026 - Pedido PV-2026-0043). 121 lineas.
--
-- Empareja por NOMBRE contra `productos` (la BD resuelve el UUID).
-- El pedido se crea en estado EN_CAMINO para que el empleado le de a
-- "Confirmar recepcion" en la caseta.
--
-- >>> EJECUTA TODO EL SCRIPT DE UNA VEZ, UNA SOLA VEZ. <<<
--     La ULTIMA tabla de resultados te dira si alguna linea no se emparejo.
-- ============================================================

drop table if exists _alb;
create temporary table _alb (nombre text, cantidad int);
insert into _alb (nombre, cantidad) values
  ('Bombetas Grandes 50UD', 1500),
  ('Bombetas Grandes 50+10', 300),
  ('Mini Petardo', 80),
  ('Cobras 50u.', 180),
  ('Supermasclet 25u.', 100),
  ('Mega Masclet 20u.', 75),
  ('Piratas 50ud', 80),
  ('Bucaneros 50u.', 40),
  ('Corsarios 50u.', 40),
  ('Mach 1', 10),
  ('Trueno Especial 8u.', 20),
  ('Trueno Che Q. Tro 5u.', 20),
  ('Trueno Gigante 5u.', 20),
  ('Cheroki N3 5u.', 20),
  ('Cheroki N4 5u.', 20),
  ('Cheroki XXL 5u.', 20),
  ('Cheroki Cadete', 20),
  ('Trueno FAM Nº0', 20),
  ('Trueno FAM Nº6', 10),
  ('Traca 40 cobras', 100),
  ('Traca 500 Cobras', 3),
  ('Traca 20 Petardos', 200),
  ('Traca Mandarin', 100),
  ('Traca Saltarines', 96),
  ('Traca Valenciana 10m.', 5),
  ('Traca Valenciana 20m.', 5),
  ('Traca Valenciana 30m.', 5),
  ('Traca Valenciana 50m.', 1),
  ('Coletas 6u.', 24),
  ('Cracker Bomba', 120),
  ('Crackeritos 50u.', 20),
  ('Kriptonita 4u.', 24),
  ('Nuclear Bomb', 48),
  ('Bengala Plumero 6u.', 24),
  ('Chispitas 16cm. 10u.', 200),
  ('Chispitas 50cm. 10u.', 10),
  ('Hypercolor 5u.', 50),
  ('La Tardor 5u.', 20),
  ('Bomberitos 6u.', 80),
  ('Camelia pequeña 12u.', 48),
  ('Abeja Borracha 3u.', 108),
  ('Payasitos 3u.', 120),
  ('Cíclope', 120),
  ('Gusanitos 10u.', 80),
  ('Turbo Spinner', 40),
  ('Ruletas 3u.', 40),
  ('Fichas 4u.', 52),
  ('Driblings 4u.', 20),
  ('12 Avispillas', 40),
  ('Fuente Karioka 1u.', 12),
  ('Cristal Mágico 4u.', 5),
  ('Pyrogiro', 5),
  ('Abejorros 12u.', 30),
  ('Abejotas 12u.', 10),
  ('3T Drone 2u.', 10),
  ('Mariquita 2u.', 10),
  ('Fuente Dulce música 1u.', 12),
  ('Mini Fuente Cracker', 24),
  ('Mini Fuente Luminosa', 72),
  ('Jarron Chino 2u.', 48),
  ('Super V Mini 2u.', 50),
  ('Fenix', 24),
  ('La Font del Pi 2u.', 12),
  ('La Murta 1u.', 8),
  ('Acuarelas 4u.', 10),
  ('Fuente Strike 16u.', 5),
  ('Fuente Grecia 1u.', 12),
  ('Noche de verano 1u.', 5),
  ('Furia 1u.', 12),
  ('Gran Carnaval 1u.', 12),
  ('Naranja&Limón 1u.', 8),
  ('Bespin Flash 2u.', 16),
  ('Geometría Triangular', 2),
  ('Gran king 1u.', 2),
  ('La Mona 1u.', 2),
  ('Bola Humo Color', 60),
  ('Fuchidors 10u.', 30),
  ('Destellos 12u.', 48),
  ('Mecha de Algodón', 1800),
  ('Botafuegos', 10),
  ('Magic Box 1u.', 18),
  ('Niagara', 20),
  ('Moco de Dragón', 48),
  ('Ranas 4u.', 72),
  ('Susto 1u.', 12),
  ('+ Susto', 8),
  ('Batería 25 Misiles', 20),
  ('Batería 100 Misiles', 5),
  ('La Caja Loca', 2),
  ('Volador Trueno', 60),
  ('Volador Roncador', 5),
  ('Volador Surtido 6 Efectos', 5),
  ('Volador Desperado', 3),
  ('Volador Galaxy', 3),
  ('Volador Hyper Space', 3),
  ('Volador Silbato Cracker', 60),
  ('Volador Risotada', 60),
  ('Volador Screaming', 5),
  ('Súper Candela 30D. Color', 36),
  ('Super Candela 30D. Cracker', 36),
  ('California 10 Bolas', 54),
  ('California 20 Bolas', 36),
  ('Pyropops', 4),
  ('Maxypops', 6),
  ('Aries', 2),
  ('Libra', 2),
  ('Tauro', 2),
  ('Cáncer', 2),
  ('Escorpio', 2),
  ('Maxi Mix Trueno', 36),
  ('Maxi Mix Color', 36),
  ('Pyropack XXL', 18),
  ('Remix Color + Trueno', 24),
  ('Hot Box', 18),
  ('Tutti Disfruti', 36),
  ('Big Bang', 36),
  ('Tropical', 36),
  ('Bucaners', 2),
  ('Moros y Cristianos', 2),
  ('Feria de Abril', 2),
  ('Fogueres', 2);

-- 1) Crea el pedido (EN_CAMINO) y sus lineas, emparejando por nombre.
--    caseta = la unica ACTIVA. Si tuvieras varias activas, sustituye la
--    subconsulta de caseta_sel por: (select id from casetas where nombre ilike '%paterna%')
with caseta_sel as (
       select id from casetas where activo = true order by nombre limit 1
     ),
     admin_sel as (
       select id from perfiles where rol = 'ADMIN' order by nombre limit 1
     ),
     nuevo as (
       insert into pedidos (caseta_id, empleado_id, notas, estado)
       select c.id, a.id,
              'Pedido Platon - albaran AS-2026-0058 (12/08/2026 - PV-2026-0043)',
              'EN_CAMINO'
       from caseta_sel c, admin_sel a
       returning id
     )
insert into pedido_items (pedido_id, producto_id, cantidad)
select n.id, p.id, al.cantidad
from nuevo n
cross join _alb al
join productos p on lower(trim(p.nombre)) = lower(trim(al.nombre));

-- 2) REPORTE FINAL (lo que veras en pantalla): cada linea y si se inserto.
--    Si todo pone "OK" es que las 121 lineas entraron. Revisa las "NO ENCONTRADO".
select
  case when p.id is null then 'NO ENCONTRADO - revisar' else 'OK' end as estado,
  al.nombre,
  al.cantidad
from _alb al
left join productos p on lower(trim(p.nombre)) = lower(trim(al.nombre))
order by (p.id is not null), al.nombre;

-- ============================================================
-- DESHACER (si algo sale mal, borra el pedido cargado):
--   delete from pedido_items where pedido_id in
--     (select id from pedidos where notas like 'Pedido Platon - albaran AS-2026-0058%');
--   delete from pedidos where notas like 'Pedido Platon - albaran AS-2026-0058%';
-- ============================================================
