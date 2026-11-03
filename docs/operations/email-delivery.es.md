# Operación de entrega de correo

PQRS Flow escribe las notificaciones de radicación y de respuesta publicada en la bandeja de salida SQLite dentro de la misma transacción de la solicitud o publicación correspondiente. La entrega es asíncrona: un fallo SMTP no revierte los datos guardados. El proceso de fondo solo se ejecuta con `EMAIL_ENABLED=true`; mientras esté deshabilitado, las notificaciones permanecen en cola y no se envían.

## Configurar SMTP

Define estas variables en el entorno privado de ejecución (nunca guardes credenciales en Git):

| Variable                       | Valor predeterminado | Propósito                                                                                                      |
| ------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `EMAIL_ENABLED`                | `false`              | Activa el proceso de la bandeja de salida.                                                                     |
| `EMAIL_FROM`                   | vacío                | Buzón remitente, opcionalmente con nombre visible.                                                             |
| `SMTP_HOST`                    | vacío                | Nombre de host o IP SMTP. Obligatorio al activar el correo.                                                    |
| `SMTP_PORT`                    | `587`                | Puerto SMTP, entre 1 y 65535.                                                                                  |
| `SMTP_SECURE`                  | `false`              | Usa TLS directo, normalmente en el puerto 465. En el puerto 587, déjalo en falso para negociar STARTTLS SMTP.  |
| `SMTP_USER` / `SMTP_PASS`      | vacío                | Credenciales SMTP opcionales; configura ambas o ninguna.                                                       |
| `EMAIL_MAX_ATTEMPTS`           | `5`                  | Intentos máximos de entrega, de 1 a 20.                                                                        |
| `EMAIL_RETRY_INITIAL_DELAY_MS` | `30000`              | Espera inicial para reintentos transitorios.                                                                   |
| `EMAIL_RETRY_MAX_DELAY_MS`     | `1800000`            | Límite máximo de la espera exponencial.                                                                        |
| `EMAIL_WORKER_INTERVAL_MS`     | `60000`              | Intervalo entre consultas de la bandeja de salida.                                                             |
| `EMAIL_BATCH_SIZE`             | `20`                 | Máximo de mensajes por ciclo, de 1 a 100.                                                                      |
| `EMAIL_DELIVERY_TIMEOUT_MS`    | `30000`              | Tiempo límite de conexión SMTP, saludo e inactividad del socket.                                               |
| `EMAIL_PROCESSING_LEASE_MS`    | `60000`              | Antigüedad a partir de la cual se recupera una reserva interrumpida; debe superar el tiempo límite de entrega. |

Los valores booleanos y los límites numéricos se validan al cargar la configuración. Al activar el correo, se requieren el remitente y el host SMTP, se rechazan saltos de línea en el remitente y el usuario SMTP y la contraseña deben configurarse juntos. Una configuración no válida impide iniciar el servidor en lugar de desactivar la entrega silenciosamente.

Ejemplo en PowerShell:

```powershell
$env:EMAIL_ENABLED = 'true'
$env:EMAIL_FROM = 'PQRS Flow <no-reply@example.com>'
$env:SMTP_HOST = 'smtp.example.com'
$env:SMTP_PORT = '587'
$env:SMTP_SECURE = 'false'
npm start
```

En Compose, configura los mismos valores mediante el archivo `.env` protegido o el gestor de secretos del despliegue. No incluyas credenciales en Compose, la imagen Docker ni el historial del shell.

## Reintentos y garantías de entrega

- Las respuestas SMTP 4xx y los fallos de red permiten reintentos. Las esperas crecen exponencialmente desde el intervalo inicial configurado y no superan el límite máximo.
- Los rechazos SMTP 5xx del destinatario o servidor, los fallos de autenticación y los sobres inválidos son terminales. El mensaje queda fallido y no se reintenta indefinidamente.
- El proceso reserva cada fila con un cambio atómico de estado en SQLite y un token único por intento. Las actualizaciones requieren ese token. Esto evita que varios procesos envíen simultáneamente la misma reserva activa dentro del modelo de despliegue de una sola instancia.
- Al iniciar, las reservas más antiguas que el plazo de procesamiento se recuperan para reintento, salvo que ya hayan agotado los intentos.
- SMTP no puede garantizar en general la entrega exactamente una vez. Si el servidor SMTP acepta un mensaje y el proceso se detiene antes de guardar el éxito en SQLite, la recuperación podría enviarlo de nuevo. La bandeja reduce el riesgo de duplicados, pero no puede eliminar este caso límite de caída.
- Cada mensaje tiene un destinatario. Las plantillas incluyen texto plano y HTML escapado, sin notas internas, identidad del personal ni respuestas sin publicar.

## Consultar el estado de entrega

Un administrador puede consultar `GET /api/admin/email-outbox` desde una sesión autenticada del personal. Solo administradores tienen el permiso `email:operations:read`. La respuesta incluye cantidades pendientes, en proceso, entregadas y fallidas; la antigüedad de la más antigua pendiente; y las fechas del último éxito y error de entrega. No expone direcciones, contenido completo, credenciales SMTP ni detalles de error sin filtrar.

Para diagnosticar el inicio y el proceso de fondo, consulta los registros sin copiar secretos en solicitudes de soporte:

```powershell
docker compose logs --tail 200 app
```

No se registran textos SMTP sin filtrar ni credenciales, y el endpoint operativo tampoco los devuelve. El error guardado para un mensaje es una clase/código genérico y acotado para diagnóstico interno. Corrige la configuración SMTP o el problema del destinatario antes de considerar cambios manuales; no edites directamente la tabla de la bandeja mientras el servidor esté activo.

## Verificación local

`npm test` incluye pruebas aisladas del protocolo SMTP mediante un servidor de prueba local dentro del proceso. Verifica entrega real con Nodemailer, reintentos 4xx, rechazo 5xx, fallo de autenticación, fallo de conexión y entrega deshabilitada. No requiere proveedor externo ni credenciales SMTP reales. Estas pruebas no demuestran que un proveedor de producción acepte correos ni que la red del despliegue permita SMTP.

Para Docker, usa `EMAIL_ENABLED=false` en una prueba de humo sin SMTP. Para probar el caso habilitado pero inaccesible, utiliza un proyecto Compose aislado y un host SMTP de prueba; verifica la salud de la aplicación y revisa solo los diagnósticos saneados.

## Límites

- PQRS Flow es una aplicación SQLite de una sola instancia. No ejecutes varias réplicas contra la misma base de datos.
- La entrega es asíncrona y de mejor esfuerzo; no hay webhooks del proveedor, procesamiento de rebotes, retroalimentación de quejas ni garantía de entrega exactamente una vez.
- Si el correo está deshabilitado, las filas pendientes se conservan. Al habilitarlo más adelante, se procesarán las notificaciones elegibles en cola.
- La conectividad SMTP y las credenciales deben verificarse en el entorno objetivo; las pruebas locales del protocolo no sustituyen esa verificación.
