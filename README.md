# ObraFlow · Control de instalaciones

Aplicación web mobile-first para administrar órdenes de instalación, reportes diarios y recepciones parciales o finales firmadas. La aplicación es una PWA servida por un Worker, usa D1 para datos compartidos y R2 para fotos de evidencia.

## Funcionalidad

- Autenticación del sitio y creación automática del primer espacio de trabajo.
- Roles de administrador y operario con validación en el servidor.
- Invitaciones por correo con token de un solo uso, expiración a siete días y aceptación ligada al correo autenticado.
- Órdenes, partidas, asignación de operarios, avances, fotos privadas en R2, firma y comprobante imprimible.
- Control de cantidades recibidas, número de factura, fecha de cobro y exportación CSV.
- Estado local para uso intermitente sin conexión y sincronización versionada con D1 al reconectar. Los conflictos de edición se informan para recargar antes de continuar.

## Datos y seguridad

Las identidades provienen de la autenticación de Sites. El API no acepta operaciones sin identidad. Los operarios reciben solo las órdenes asignadas a su correo y pueden agregar avances y recepciones; el servidor valida esos cambios y rechaza alteraciones de administración. Las invitaciones guardan un hash del token, no el token original.

El esquema de D1 guarda cada espacio como un documento JSON versionado, más miembros e invitaciones en tablas relacionales. Es una primera etapa para centralizar el flujo. Antes de escalar como SaaS se recomienda normalizar órdenes, partidas, avances, fotos, recepciones y auditoría en tablas separadas, y mantener los archivos de imagen en R2 con políticas de retención y respaldos.

## Acceso del equipo

El sitio conserva su acceso privado. Para que un invitado abra el enlace, además de la invitación debe tener autorización para acceder al Site y autenticarse con el mismo correo invitado. La invitación se crea desde Equipo. El enlace debe compartirse por un canal privado.

## Operación local

- `pnpm run db:generate`: genera una migración desde `db/schema.ts`.
- `pnpm run dev`: inicia el entorno local.
- `pnpm run build`: genera los artefactos del Worker.
- Las migraciones locales se aplican con Wrangler contra el D1 local según la guía del starter Sites.

La firma es una captura de aceptación en pantalla; no corresponde a firma electrónica avanzada. El comprobante imprimible no reemplaza una revisión legal de su validez en cada uso.
