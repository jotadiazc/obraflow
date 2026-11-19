# ObraFlow

Aplicación web mobile-first para gestionar órdenes de instalación, avances diarios, evidencias fotográficas y recepciones parciales o finales con firma.

## Funciones

- Acceso propio con correo y contraseña; no existe registro público.
- El administrador crea invitaciones, asigna rol de administrador u operario, restablece contraseñas y activa o desactiva cuentas.
- Contraseñas con PBKDF2-SHA-256, sesiones aleatorias almacenadas como hash, cookie `HttpOnly` y bloqueo temporal tras intentos fallidos.
- Órdenes y partidas, asignación de operarios, avances, fotos en R2, firmas, comprobantes, facturación y exportación CSV.
- Sincronización del estado de las órdenes en PostgreSQL con control de versiones y soporte local intermitente sin conexión.

## Requisitos

- Node.js 22.13 o superior y pnpm 11.
- Una base PostgreSQL accesible desde el entorno de ejecución.
- Para producción: Cloudflare Workers y un bucket R2 vinculado como `BUCKET`. Se puede conectar PostgreSQL mediante `DATABASE_URL` o mediante un binding Hyperdrive llamado `HYPERDRIVE`.

## Configurar PostgreSQL y crear al administrador inicial

Define `DATABASE_URL` con la cadena de conexión de tu base. Para aplicar el esquema y crear la primera cuenta, desde la raíz del proyecto ejecuta:

```bash
export DATABASE_URL='postgresql://USUARIO:CLAVE@HOST:5432/BASE?sslmode=require'
pnpm install --frozen-lockfile
pnpm db:migrate

read -r -p 'Correo del administrador: ' OWNER_EMAIL
read -r -p 'Nombre del administrador: ' OWNER_NAME
read -r -s -p 'Contraseña inicial (12 caracteres mínimo): ' OWNER_PASSWORD
printf '\n'
export OWNER_EMAIL OWNER_NAME OWNER_PASSWORD
pnpm db:bootstrap-admin
unset OWNER_PASSWORD OWNER_EMAIL OWNER_NAME DATABASE_URL
```

La creación inicial se permite únicamente cuando la tabla de usuarios está vacía. Guarda `DATABASE_URL` como secreto en producción; no lo incluyas en el repositorio. El script de migración corre con una conexión PostgreSQL directa desde Node.js. Para conectar el Worker, configura `DATABASE_URL` como secreto o crea el binding `HYPERDRIVE` en Cloudflare.

## Desarrollo local

1. Crea un archivo local `dev.vars` y define allí `DATABASE_URL` con la cadena de conexión de tu PostgreSQL. Ese archivo no se debe subir al repositorio.
2. Crea un bucket R2 local o remoto y confirma que el binding se llame `BUCKET`.
3. Ejecuta `pnpm install`, `pnpm db:migrate` y `pnpm db:bootstrap-admin`.
4. Ejecuta `pnpm dev`.

`pnpm build` prepara la aplicación para Cloudflare Workers. En producción, configura el secreto `DATABASE_URL` (o Hyperdrive), el bucket R2 `BUCKET` y el dominio en Cloudflare.

## Administrar cuentas

Inicia sesión como administrador y abre **Equipo**. Desde allí puedes crear invitaciones por correo y escoger su rol. El enlace vence en siete días; al aceptarlo, la persona define su contraseña. Desde la lista de personas puedes establecer una contraseña temporal, lo que cierra las sesiones anteriores, o desactivar y volver a activar una cuenta. El último administrador activo no se puede desactivar.

La aplicación no envía correos de invitación: copia el enlace generado y compártelo con la persona por un canal privado.

## Datos y transición desde la versión anterior

El esquema PostgreSQL está en `db/migrations/0001_initial_postgresql.sql`. Los datos de la base anterior D1 no se copian automáticamente. Antes de cambiar la aplicación publicada a PostgreSQL, exporta y verifica las órdenes, miembros e invitaciones que deban conservarse.

Las fotografías siguen guardadas en R2; PostgreSQL conserva sus metadatos. La firma es una captura de aceptación en pantalla y no corresponde a firma electrónica avanzada.
