-- ============================================================
-- LA PETARDERÍA — Schema completo Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLAS
-- ============================================================

CREATE TABLE casetas (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  activa     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usuarios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  rol         TEXT NOT NULL CHECK (rol IN ('ADMIN','EMPLEADO')),
  caseta_id   INTEGER REFERENCES casetas(id),
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE categorias (
  id     SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL
);

CREATE TABLE productos (
  id           SERIAL PRIMARY KEY,
  nombre       TEXT NOT NULL,
  precio       NUMERIC(10,2) NOT NULL,
  categoria    TEXT NOT NULL,
  edad_minima  INTEGER DEFAULT 0,
  codigo_ean   TEXT UNIQUE NOT NULL,
  activo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_por_caseta (
  id         SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  caseta_id   INTEGER REFERENCES casetas(id) ON DELETE CASCADE,
  cantidad    INTEGER DEFAULT 0 CHECK (cantidad >= 0),
  UNIQUE(producto_id, caseta_id)
);

CREATE TABLE ofertas (
  id            SERIAL PRIMARY KEY,
  producto_id   INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  etiqueta      TEXT NOT NULL,
  cantidad_pack INTEGER NOT NULL CHECK (cantidad_pack >= 2),
  precio_pack   NUMERIC(10,2) NOT NULL,
  activa        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cajas (
  id          SERIAL PRIMARY KEY,
  caseta_id   INTEGER REFERENCES casetas(id),
  abierto_por UUID REFERENCES usuarios(id),
  abierto_en  TIMESTAMPTZ DEFAULT NOW(),
  cerrado_en  TIMESTAMPTZ,
  apertura    NUMERIC(10,2) NOT NULL DEFAULT 0,
  contado_cierre NUMERIC(10,2),
  estado      TEXT DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada'))
);

CREATE TABLE tickets (
  id          SERIAL PRIMARY KEY,
  caseta_id   INTEGER REFERENCES casetas(id),
  caja_id     INTEGER REFERENCES cajas(id),
  empleado_id UUID REFERENCES usuarios(id),
  metodo_pago TEXT NOT NULL CHECK (metodo_pago IN ('efectivo','tarjeta')),
  total       NUMERIC(10,2) NOT NULL,
  cambio      NUMERIC(10,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ticket_items (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id),
  cantidad    INTEGER NOT NULL,
  precio_unit NUMERIC(10,2) NOT NULL,
  precio_total NUMERIC(10,2) NOT NULL,
  con_oferta  BOOLEAN DEFAULT false
);

-- ============================================================
-- TRIGGER: updated_at en productos
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- FUNCIÓN: descontar stock con bloqueo de fila (evita negativos)
-- ============================================================
CREATE OR REPLACE FUNCTION descontar_stock(
  p_caseta_id INTEGER,
  p_items JSONB  -- [{producto_id, cantidad}]
) RETURNS VOID AS $$
DECLARE
  item JSONB;
  stock_actual INTEGER;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT cantidad INTO stock_actual
    FROM stock_por_caseta
    WHERE producto_id = (item->>'producto_id')::INTEGER
      AND caseta_id = p_caseta_id
    FOR UPDATE;  -- bloqueo de fila

    IF stock_actual IS NULL THEN
      RAISE EXCEPTION 'Producto % no tiene stock en esta caseta', item->>'producto_id';
    END IF;

    IF stock_actual < (item->>'cantidad')::INTEGER THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', item->>'producto_id';
    END IF;

    UPDATE stock_por_caseta
    SET cantidad = cantidad - (item->>'cantidad')::INTEGER
    WHERE producto_id = (item->>'producto_id')::INTEGER
      AND caseta_id = p_caseta_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE casetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_por_caseta ENABLE ROW LEVEL SECURITY;
ALTER TABLE ofertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_items ENABLE ROW LEVEL SECURITY;

-- Política: acceso público con service_role (el backend usa service_role key)
-- El frontend NUNCA toca Supabase directamente, solo llama a nuestra API en Vercel
CREATE POLICY "service_role_all" ON casetas FOR ALL USING (true);
CREATE POLICY "service_role_all" ON usuarios FOR ALL USING (true);
CREATE POLICY "service_role_all" ON productos FOR ALL USING (true);
CREATE POLICY "service_role_all" ON stock_por_caseta FOR ALL USING (true);
CREATE POLICY "service_role_all" ON ofertas FOR ALL USING (true);
CREATE POLICY "service_role_all" ON cajas FOR ALL USING (true);
CREATE POLICY "service_role_all" ON tickets FOR ALL USING (true);
CREATE POLICY "service_role_all" ON ticket_items FOR ALL USING (true);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_productos_ean ON productos(codigo_ean);
CREATE INDEX idx_stock_caseta ON stock_por_caseta(caseta_id);
CREATE INDEX idx_stock_producto ON stock_por_caseta(producto_id);
CREATE INDEX idx_tickets_caja ON tickets(caja_id);
CREATE INDEX idx_tickets_caseta ON tickets(caseta_id);
CREATE INDEX idx_cajas_caseta_estado ON cajas(caseta_id, estado);

-- ============================================================
-- DATOS INICIALES — Casetas
-- ============================================================
INSERT INTO casetas (nombre) VALUES
  ('La Petarderia Ruzafa'),
  ('La Petarderia Massanassa'),
  ('La Petarderia Cabanyal'),
  ('La Petarderia Alzira');

-- ============================================================
-- DATOS INICIALES — Productos del catalogo 2026
-- ============================================================
INSERT INTO productos (nombre, precio, categoria, edad_minima, codigo_ean) VALUES
  ('Bombeta Japonesa 50u.',  1.00,  'Petardos',   12, '8410278001'),
  ('Bombetas Grandes 50u.',  2.00,  'Petardos',   12, '8410278002'),
  ('Mini Petardo 100u.',     1.50,  'Petardos',   16, '8410278003'),
  ('Piratas 50u.',           1.00,  'Petardos',   16, '8410278004'),
  ('Bucaneros 50u.',         1.50,  'Petardos',   16, '8410278005'),
  ('Corsarios 50u.',         2.50,  'Petardos',   16, '8410278006'),
  ('100 Petardos 100u.',     1.50,  'Petardos',   16, '8410278007'),
  ('Cobras 50u.',            2.50,  'Petardos',   16, '8410278008'),
  ('Ninjas 100u.',           1.50,  'Petardos',   16, '8410278009'),
  ('Supermasclet 25u.',      2.98,  'Petardos',   16, '8410278010'),
  ('Granada Trueno 4u.',     5.50,  'Petardos',   16, '8410278011'),
  ('Mega Masclet 20u.',      5.00,  'Petardos',   16, '8410278012'),
  ('Kit Ninja',              4.50,  'Petardos',   16, '8410278013'),
  ('Trueno Especial 8u.',   11.95,  'Truenos',    18, '8410278014'),
  ('Trueno Gigante 5u.',    14.95,  'Truenos',    18, '8410278015'),
  ('Traca 20 Petardos',      1.00,  'Truenos',    16, '8410278016'),
  ('Traca 40 Cobras',        1.50,  'Truenos',    18, '8410278017'),
  ('Traca Saltarines',       1.00,  'Truenos',    16, '8410278018'),
  ('Traca Mandarin',         1.00,  'Truenos',    16, '8410278019'),
  ('Bengala Plumero 6u.',    2.50,  'Bengalas',   12, '8410278020'),
  ('Chispitas 16cm. 10u.',   1.00,  'Bengalas',   12, '8410278021'),
  ('Chispitas 30cm. 10u.',   2.00,  'Bengalas',   12, '8410278022'),
  ('Chispitas 50cm. 10u.',   3.50,  'Bengalas',   12, '8410278023'),
  ('Hypercolor 5u.',         3.50,  'Bengalas',   12, '8410278024'),
  ('Coletas 6u.',            3.00,  'Cracker',    16, '8410278025'),
  ('Canicas espaciales 6u.', 2.00,  'Cracker',    16, '8410278026'),
  ('Cracker Bomba 12u.',     2.00,  'Cracker',    16, '8410278027'),
  ('Crackeritos 50u.',       4.00,  'Cracker',    12, '8410278028'),
  ('Gusanitos 10u.',         2.00,  'Terrestres', 16, '8410278029'),
  ('Abeja Borracha 3u.',     1.50,  'Terrestres', 12, '8410278030'),
  ('Payasitos 3u.',          1.50,  'Terrestres', 12, '8410278031'),
  ('Ranas 4u.',              2.00,  'Terrestres', 16, '8410278032'),
  ('Bomberitos 6u.',         3.00,  'Terrestres', 12, '8410278033'),
  ('Mini F. Luminosa 4u.',   2.00,  'Fuentes',    12, '8410278034'),
  ('Jarron Chino 2u.',       3.50,  'Fuentes',    16, '8410278035'),
  ('Fuente Fenix 1u.',       2.00,  'Fuentes',    16, '8410278036'),
  ('Flower Power 3u.',       5.50,  'Fuentes',    16, '8410278037'),
  ('Furia 1u.',              5.95,  'Fuentes',    16, '8410278038'),
  ('Pyropack XXL',          44.99,  'Packs',      16, '8410278039'),
  ('Maxi Mix Color',        25.99,  'Packs',      16, '8410278040'),
  ('Maxi Mix Trueno',       19.99,  'Packs',      16, '8410278041'),
  ('Destellos 12u.',         2.00,  'Efectos',    16, '8410278042'),
  ('Fuchidors 10u.',         3.00,  'Efectos',    12, '8410278043'),
  ('Magic Box 1u.',          1.75,  'Efectos',    16, '8410278044'),
  ('Mecha Algodon 25cm.',    0.25,  'Accesorios',  0, '8410278045');

-- ============================================================
-- STOCK INICIAL — 50 unidades de cada producto en cada caseta
-- ============================================================
INSERT INTO stock_por_caseta (producto_id, caseta_id, cantidad)
SELECT p.id, c.id, 50
FROM productos p CROSS JOIN casetas c;

-- Stock ajustado para productos caros/limitados
UPDATE stock_por_caseta SET cantidad = 10
WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE '%Pyropack%' OR nombre LIKE '%Maxi Mix%');
UPDATE stock_por_caseta SET cantidad = 200
WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE '%Mecha%');
UPDATE stock_por_caseta SET cantidad = 20
WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE '%Trueno%' OR nombre LIKE '%Granada%');

-- ============================================================
-- OFERTAS INICIALES
-- ============================================================
INSERT INTO ofertas (producto_id, etiqueta, cantidad_pack, precio_pack) VALUES
  ((SELECT id FROM productos WHERE nombre = 'Bombeta Japonesa 50u.'),  '5 x 3€',    5,  3.00),
  ((SELECT id FROM productos WHERE nombre = 'Bombetas Grandes 50u.'),  '4 x 5€',    4,  5.00),
  ((SELECT id FROM productos WHERE nombre = 'Bombetas Grandes 50u.'),  '10 x 10€', 10, 10.00),
  ((SELECT id FROM productos WHERE nombre = 'Piratas 50u.'),           '5 x 3€',    5,  3.00),
  ((SELECT id FROM productos WHERE nombre = 'Piratas 50u.'),           '4 x 5€',    4,  5.00),
  ((SELECT id FROM productos WHERE nombre = 'Cobras 50u.'),            '3 x 5€',    3,  5.00),
  ((SELECT id FROM productos WHERE nombre = 'Ninjas 100u.'),           '2 x 2,50€', 2,  2.50),
  ((SELECT id FROM productos WHERE nombre = 'Cracker Bomba 12u.'),     '3 x 5€',    3,  5.00),
  ((SELECT id FROM productos WHERE nombre = 'Canicas espaciales 6u.'), '3 x 5€',    3,  5.00),
  ((SELECT id FROM productos WHERE nombre = 'Mecha Algodon 25cm.'),    '5 x 1€',    5,  1.00);

-- ============================================================
-- USUARIO ADMIN INICIAL
-- Nota: la contraseña se gestiona via Supabase Auth.
-- Este registro es solo para datos de perfil.
-- Crear el usuario auth primero en: Auth > Users > Add user
-- Email: admin@lapetarderia.es  Password: (la que quieras)
-- Luego copiar el UUID aqui:
-- ============================================================
-- INSERT INTO usuarios (id, nombre, email, rol) VALUES
--   ('PEGA-UUID-AQUI', 'Admin Principal', 'admin@lapetarderia.es', 'ADMIN');

-- ============================================================
-- VISTA: resumen de caja activa por caseta
-- ============================================================
CREATE OR REPLACE VIEW vista_caja_activa AS
SELECT
  ca.id AS caja_id,
  ca.caseta_id,
  cs.nombre AS caseta_nombre,
  ca.apertura,
  ca.abierto_en,
  u.nombre AS abierto_por,
  COUNT(t.id) AS num_tickets,
  COALESCE(SUM(CASE WHEN t.metodo_pago = 'efectivo' THEN t.total ELSE 0 END), 0) AS total_efectivo,
  COALESCE(SUM(CASE WHEN t.metodo_pago = 'tarjeta'  THEN t.total ELSE 0 END), 0) AS total_tarjeta,
  COALESCE(SUM(t.total), 0) AS total_ventas
FROM cajas ca
JOIN casetas cs ON cs.id = ca.caseta_id
JOIN usuarios u ON u.id = ca.abierto_por
LEFT JOIN tickets t ON t.caja_id = ca.id
WHERE ca.estado = 'abierta'
GROUP BY ca.id, ca.caseta_id, cs.nombre, ca.apertura, ca.abierto_en, u.nombre;

-- ============================================================
-- VISTA: ventas por empleado en caja activa (para cierre)
-- ============================================================
CREATE OR REPLACE VIEW vista_ventas_por_empleado AS
SELECT
  t.caja_id,
  t.caseta_id,
  u.nombre AS empleado,
  t.metodo_pago,
  COUNT(t.id) AS num_tickets,
  SUM(t.total) AS total
FROM tickets t
JOIN usuarios u ON u.id = t.empleado_id
GROUP BY t.caja_id, t.caseta_id, u.nombre, t.metodo_pago;
