# Operaciones de respaldo y restauración

PQRS Flow almacena los datos operativos en dos ubicaciones: la base SQLite (`DB_PATH`) y los archivos adjuntos (`ATTACHMENTS_STORAGE_DIR`). Un respaldo útil debe incluir ambos recursos.

## Crear un respaldo

Detén primero la aplicación para evitar escrituras o cargas de adjuntos durante la copia. Con Docker Compose:

```powershell
docker compose stop
npm run db:backup
docker compose start
```

El comando crea una carpeta con marca de tiempo dentro de `backups/`, con `pqrs.db`, `attachments/` y `manifest.json`. La base se exporta mediante la API de backup online de SQLite de `better-sqlite3`, que incluye los datos confirmados que estén en WAL. El manifiesto registra sumas SHA-256 de la base y de cada adjunto. Guarda la carpeta en almacenamiento protegido y separado del equipo que ejecuta la aplicación. Los respaldos pueden contener datos personales y sensibles: limita el acceso y cifra el almacenamiento con los controles aprobados por tu organización.

Si el comando falla, revisa el error y no consideres válida una carpeta parcial. Inicia de nuevo el servicio cuando termine el comando.

## Restaurar un respaldo

**Detén la aplicación y asegúrate de que ningún otro proceso tenga abierta la base de datos. La restauración reemplaza la base y el directorio de adjuntos actuales.** Usa la ruta absoluta de la carpeta del respaldo:

```powershell
docker compose stop
npm run db:restore -- "C:\ruta\al\respaldo\pqrs-flow-2026-10-30T22-00-00-000Z"
docker compose start
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health
```

Antes de modificar los datos activos, el comando valida la versión del formato, la suma de la base, las sumas de todos los adjuntos, `integrity_check` de SQLite y la consistencia de claves foráneas. Prepara los archivos junto a sus destinos e intenta revertir el reemplazo si ocurre un error. Conserva una copia independiente de los datos actuales antes de restaurar. Después del inicio, verifica solicitudes y adjuntos representativos desde la aplicación; una respuesta HTTP de salud no demuestra por sí sola que los datos funcionales sean correctos.

En producción, configura explícitamente `RESTORE_CONFIRM=YES` al ejecutar la restauración. No expongas esta confirmación mediante un endpoint público.

## Límites importantes

- La aplicación debe estar detenida para respaldar coordinadamente la base y los adjuntos, y para restaurar.
- Esta herramienta es local; no es un servicio de respaldos programados ni de replicación remota.
- El respaldo no incluye `.env`, credenciales, claves de cifrado, configuración SMTP, metadatos de volúmenes Docker ni configuración de infraestructura externa. Conserva los secretos por separado con un gestor aprobado. En particular, conserva la misma `MFA_ENCRYPTION_KEY`; sin ella, los secretos MFA cifrados podrían quedar ilegibles.
- Una suma de verificación detecta cambios accidentales; no cifra los datos ni demuestra que el respaldo sea confiable si un atacante puede reemplazar tanto los archivos como el manifiesto.
- Conserva varias generaciones y realiza periódicamente una prueba de restauración en un entorno aislado.
- PQRS Flow sigue siendo una aplicación SQLite de una sola instancia. No ejecutes varias réplicas contra la misma base.
