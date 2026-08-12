-- ============================================================
-- 017_ajustar_stock_definer.sql
-- Arregla la recepción de pedidos: `ajustar_stock` (usada al recibir
-- mercancía para SUMAR stock) no era SECURITY DEFINER, así que un empleado
-- chocaba con la RLS de la tabla `stock` (solo ADMIN puede escribir) y salía
-- «new row violates row-level security policy for table stock» (403).
--
-- La redefinimos como SECURITY DEFINER (como el resto de funciones de stock)
-- y añadimos un control: el empleado solo puede ajustar SU caseta; el admin,
-- cualquiera.
-- ============================================================

create or replace function ajustar_stock(
  p_producto_id uuid,
  p_caseta_id   uuid,
  p_delta       integer
) returns integer as $$
declare
  nueva integer;
begin
  if get_my_rol() <> 'ADMIN' then
    if p_caseta_id <> get_my_caseta() then
      raise exception 'No puedes ajustar el stock de otra caseta';
    end if;
  end if;

  insert into stock (producto_id, caseta_id, cantidad)
  values (p_producto_id, p_caseta_id, greatest(0, p_delta))
  on conflict (producto_id, caseta_id)
  do update set cantidad = greatest(0, stock.cantidad + p_delta),
                updated_at = now()
  returning cantidad into nueva;

  return nueva;
end;
$$ language plpgsql security definer;
