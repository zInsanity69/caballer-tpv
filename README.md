# La Petardería TPV — Guía de despliegue

Sistema TPV completo: frontend React en Vercel + base de datos en Supabase.

---

## PASO 1 — Supabase (base de datos)

1. Ve a https://supabase.com y crea una cuenta gratuita
2. Crea un nuevo proyecto (elige región Europe West)
3. Ve a **SQL Editor** > **New query**
4. Copia el contenido de `supabase/migrations/001_schema.sql` y ejecútalo
5. Se crean todas las tablas, el catálogo completo de 45 productos y las ofertas iniciales

### Crear el primer usuario Admin

1. Supabase > **Authentication** > **Users** > **Add user**
2. Email: admin@lapetarderia.es / Password: (la que quieras)
3. Copia el UUID del usuario creado
4. Ejecuta en SQL Editor:
   ```sql
   INSERT INTO usuarios (id, nombre, email, rol)
   VALUES ('PEGA-UUID-AQUI', 'Admin Principal', 'admin@lapetarderia.es', 'ADMIN');
   ```

### Obtener las claves API de Supabase

**Settings > API:**
- `Project URL` → SUPABASE_URL
- `service_role` (secret key) → SUPABASE_SERVICE_KEY  ⚠️ Nunca en el frontend

---

## PASO 2 — Vercel (frontend + API)

### Subir a GitHub

```bash
cd frontend
git init
git add .
git commit -m "La Petarderia TPV v2"
git remote add origin https://github.com/TU_USUARIO/petarderia-tpv.git
git push -u origin main
```

### Desplegar en Vercel

1. vercel.com > **Add New Project** > importar repo
2. **Environment Variables:**
   - `SUPABASE_URL` = tu Project URL
   - `SUPABASE_SERVICE_KEY` = tu service_role key
3. **Deploy** → URL lista en ~2 minutos

---

## PASO 3 — Crear empleados

Una vez dentro como admin: **Usuarios > Nuevo Usuario > rol Empleado > asignar caseta**

---

## Notas importantes

- El escáner de cámara solo funciona en HTTPS (Vercel lo pone automáticamente)
- La caja es compartida por caseta: varios empleados comparten la misma caja física
- El stock se descuenta atómicamente en la BD para evitar negativos con ventas simultáneas
