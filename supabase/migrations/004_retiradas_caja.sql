-- Retiradas de efectivo de caja (sacar dinero por seguridad durante el turno)

create table if not exists retiradas_caja (
  id          uuid primary key default uuid_generate_v4(),
  caja_id     uuid not null references cajas(id) on delete cascade,
  caseta_id   uuid not null references casetas(id),
  empleado_id uuid not null references perfiles(id),
  cantidad    numeric(10,2) not null check (cantidad > 0),
  motivo      text,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_retiradas_caja on retiradas_caja(caja_id);
create index if not exists idx_retiradas_caseta on retiradas_caja(caseta_id);

alter table retiradas_caja enable row level security;

-- Admins y encargados ven todo
create policy "admin_all_retiradas" on retiradas_caja
  for all using (get_my_rol() in ('admin','encargado'));

-- Empleados solo ven las de su propia caja
create policy "empleado_retiradas_propia_caja" on retiradas_caja
  for select using (
    empleado_id = auth.uid()
  );

-- Empleados pueden insertar retiradas en cajas abiertas de su caseta
create policy "empleado_insert_retirada" on retiradas_caja
  for insert with check (
    empleado_id = auth.uid() and
    exists (
      select 1 from cajas c
      join perfiles p on p.id = auth.uid()
      where c.id = caja_id
        and c.estado = 'ABIERTA'
        and c.caseta_id = p.caseta_id
    )
  );

-- Registrar tipo de alerta Telegram para retiradas
insert into alertas_config (tipo) values ('retirada_caja') on conflict do nothing;
