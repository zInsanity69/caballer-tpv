-- ============================================================
-- 018_ventas_totales_por_caseta.sql
-- Función para el Dashboard: ganado por caseta en un periodo.
--   p_desde NULL  -> todo el histórico
--   p_desde fecha -> solo tickets con creado_en >= p_desde
-- El front la llama con el inicio del mes (por defecto) o el inicio del día (toggle).
-- Devuelve total y nº de tickets por caseta, ordenado de mayor a menor.
--
-- SECURITY DEFINER + guard de ADMIN (como el resto de funciones de admin).
-- ============================================================

-- Por si se aplicó una versión anterior sin parámetro:
drop function if exists ventas_totales_por_caseta();
drop function if exists ventas_totales_por_caseta(timestamptz);

create or replace function ventas_totales_por_caseta(p_desde timestamptz default null)
returns table (
  caseta_id    uuid,
  nombre       text,
  activo       boolean,
  total_ventas numeric,
  num_tickets  bigint
) as $$
begin
  if get_my_rol() <> 'ADMIN' then
    raise exception 'Solo administradores';
  end if;

  return query
    select c.id, c.nombre, c.activo,
           coalesce(sum(t.total), 0)::numeric as total_ventas,
           count(t.id)                        as num_tickets
    from casetas c
    left join tickets t
      on t.caseta_id = c.id
     and (p_desde is null or t.creado_en >= p_desde)
    group by c.id, c.nombre, c.activo
    order by coalesce(sum(t.total), 0) desc, c.nombre;
end;
$$ language plpgsql security definer stable;
