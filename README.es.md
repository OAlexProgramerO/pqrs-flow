# PQRS Flow

[![CI](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/OAlexProgramerO/pqrs-flow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)

[English](./README.md) · **Español**

Un sistema web para radicar, consultar y gestionar **PQRS** — _Peticiones, Quejas, Reclamos y Sugerencias_. Está construido de principio a fin con JavaScript, priorizando la simplicidad, la ausencia de un paso de compilación en el frontend y límites de arquitectura claros.

**Implementación local: v0.3.4 — Adjuntos seguros y refinamiento de la aplicación** — Los archivos adjuntos se validan, se guardan fuera de la raíz web pública y solo se entregan a través de rutas de descarga autorizadas por caso. El personal puede revisar los archivos permitidos y los ciudadanos solo acceden a los adjuntos de la solicitud que verificaron. Este checkout no se ha publicado ni desplegado; lee [docs/security.md](./docs/security.md) antes de exponerlo (ese documento está en inglés).

> Este archivo es la versión en español de [README.md](./README.md). Si algo difiere, el README en inglés y el código son la referencia. Los cambios de la implementación local 0.3.3 están en [CHANGELOG.md](./CHANGELOG.md).

---

## 📖 El problema y la solución

Muchas organizaciones todavía gestionan sugerencias, quejas y solicitudes con correos dispersos, formularios en papel o mensajes en redes sociales. Las solicitudes se pierden, las respuestas llegan tarde y las personas se quedan sin respuesta.

**PQRS Flow ofrece:**

1. **Portal público de radicación:** un formulario adaptable a cualquier pantalla que guarda la solicitud y devuelve un número de caso único, como `PQRS-2026-000001`.
2. **Consulta de estado:** una página pública donde cualquier persona revisa el estado con el número de caso y su correo, sin necesidad de cuenta.
3. **Panel interno para el personal:** un área protegida (`/admin/`) donde el personal autorizado inicia sesión, revisa los casos entrantes, los busca y filtra, y actualiza su estado (`Radicada → En trámite → Respondida → Cerrada`). Cada cambio queda registrado en un historial de auditoría.

### Estado del proyecto

| Funcionalidad                                                          | Versión | Estado                  |
| ---------------------------------------------------------------------- | ------- | ----------------------- |
| Servidor Express, endpoint de salud, sitio estático                    | 0.0.1   | Hecho                   |
| Formulario de radicación con validación en el cliente                  | 0.0.2   | Hecho                   |
| Base de datos, migraciones y repositorio                               | 0.0.3   | Hecho                   |
| `POST /api/pqrs`, formulario conectado a la API, número de caso        | 0.1.0   | Hecho                   |
| Consulta de estado con número de caso y correo                         | 0.1.1   | Hecho                   |
| Límite de radicaciones, compresión, configuración de proxy             | 0.1.2   | Hecho                   |
| Cabeceras de caché para archivos estáticos, CORS desde el entorno      | 0.1.3   | Hecho                   |
| Panel del personal: login, tablero, búsqueda, cambios de estado        | 0.2.0   | Hecho                   |
| Historial de auditoría de cada cambio de estado                        | 0.2.0   | Hecho                   |
| Apagado limpio, README en español, pruebas de regresión de aislamiento | 0.3.0   | Hecho                   |
| Roles, cuentas y seguridad del personal                                | 0.3.1   | Hecho                   |
| Respuestas, notas internas, asignación y auditoría de solicitudes      | 0.3.2   | En curso                |
| Reglas configurables de plazos hábiles y calendario de festivos        | 0.3.3   | Implementado localmente |
| Adjuntos seguros y refinamiento de la aplicación                       | 0.3.4   | Implementado localmente |
| Correos y reportes                                                     | 0.3.5+  | Planeado                |

## ✨ Qué hace hoy

- Formulario de radicación con validación en vivo, contador de caracteres y mensajes de error accesibles.
- Las mismas reglas de validación se ejecutan en el navegador y en el servidor (`shared/validation.js`).
- Almacenamiento en SQLite con migraciones versionadas. Los números de caso se generan de forma atómica, con un contador por año.
- Pantalla de éxito con el número de caso, un botón para copiarlo y un enlace para consultar la solicitud.
- Página de consulta: el número de caso más el correo muestran el estado con una línea de tiempo del avance.
- Privacidad por diseño: la consulta devuelve solo estado, tipo y fechas (y una respuesta oficial publicada, si existe); nunca expone plazos internos. Un correo incorrecto y un número de caso inexistente se ven igual, y cada intento tiene límite de frecuencia.
- Campo anti-spam, límite de 16 KB por cuerpo de petición e identificador de petición en cada respuesta.
- Las radicaciones tienen límite por dirección de cliente (10 cada 15 minutos por defecto, configurable en `.env`).
- Las respuestas de texto (páginas, estilos, scripts, JSON) se comprimen con gzip o brotli, sin dependencias adicionales.
- Funciona detrás de un proxy inverso: `TRUST_PROXY` hace que los límites vean al visitante real.
- Reglas de caché: las páginas siempre se revalidan, los estilos y scripts se conservan una hora en producción y las respuestas de la API nunca se almacenan.
- CORS está cerrado por defecto, porque las páginas vienen del mismo servidor. `CORS_ORIGINS` lo abre para los sitios que listes.
- **Login del personal** con hashes de contraseña `scrypt`, sesiones opacas en el servidor (solo se guarda el hash del token), una cookie `HttpOnly` + `SameSite=Strict` (y `Secure` en producción), protección CSRF y límites de intentos de login por dirección y por cuenta.
- **Panel protegido** bajo `/admin/`: los visitantes anónimos solo ven la página de login. La carpeta del panel está fuera de `frontend/`, así que el servidor de archivos estáticos público no puede servirla.
- **Tablero**: contadores por estado, una lista paginada con búsqueda, filtros por estado, tipo y rango de fechas, ordenamiento y una página de detalle para cada solicitud. Adaptable a cualquier pantalla y usable con teclado.
- **Gestión de plazos**: la lista y el detalle del personal muestran estados al día, próximos, vencidos, completados o no disponibles. Los administradores configuran reglas de días hábiles por tipo y festivos explícitos mediante la API protegida. Cada solicitud nueva conserva la versión de regla, fecha límite y festivos aplicables; los cambios nunca reescriben plazos históricos.
- **Flujo de estados** con transiciones permitidas (`closed` es final) y protección cuando dos personas cambian la misma solicitud.
- **Historial de auditoría**: cada cambio de estado registra quién, de qué estado a cuál, cuándo y con qué identificador de petición. Se guarda en la misma transacción que el cambio, solo se puede agregar (no modificar) y nunca se muestra al público.
- **Acceso por roles**: los administradores gestionan cuentas; el personal puede consultar y tramitar PQRS, pero no administrar cuentas. Ambos roles pueden acceder a todas las PQRS; aún no hay permisos por asignación.
- **Gestión de cuentas**: los administradores pueden crear y editar cuentas, asignar roles, activar/desactivar cuentas y restablecer contraseñas en `/admin/accounts.html`. Las cuentas nuevas y restablecidas deben cambiar su contraseña temporal al iniciar sesión.
- **Seguridad** (`/admin/security.html`): cada persona puede cambiar su contraseña, consultar sus sesiones activas y revocar una o todas las demás sesiones. El cambio de contraseña conserva la sesión actual y revoca las demás.
- **Auditoría de solo adición de cuentas**: los cambios de cuenta, rol, contraseña y sesiones se registran en transacciones, con el identificador de petición. Nunca se guardan contraseñas, tokens ni hashes en la auditoría.
- **Herramienta de cuentas** (`npm run admin`): permite crear la primera cuenta o recuperarla desde la terminal del servidor. No hay cuentas por defecto.
- Apagado limpio: `Ctrl+C` o `SIGTERM` dejan de aceptar conexiones, permiten terminar las peticiones en curso (hasta 10 segundos) y cierran la base de datos SQLite.
- Datos de demostración y comandos para reiniciar la base de datos en desarrollo local.
- Pruebas de validación, base de datos y migraciones, servicio, controlador, limitador de frecuencia, compresión, API, autenticación, autorización, auditoría, utilidades de estado y ambos frontends.

## 🛠️ Tecnologías

Este proyecto evita deliberadamente los frameworks pesados de frontend y los ORM, para mostrar fundamentos sólidos en JavaScript puro, manipulación del DOM, SQL y diseño de APIs REST.

- **Backend:** Node.js 22+, Express (API REST, enrutamiento, middlewares).
- **Frontend:** HTML5, CSS3 y JavaScript puro (módulos ES), servidos como archivos estáticos.
- **Base de datos:** SQLite mediante `better-sqlite3` (modo WAL, migraciones SQL versionadas), elegida por su cero configuración y portabilidad en un solo archivo.
- **Autenticación:** el `crypto` integrado de Node (`scrypt`, tokens aleatorios seguros). No se añadió ninguna librería de autenticación.
- **Código compartido:** un módulo de validación usado por el navegador y por el servidor.
- **Calidad y CI:** el ejecutor de pruebas nativo de Node (`node:test`), ESLint, Prettier y GitHub Actions en Node 22 y 24.

### Arquitectura

El backend sigue una estructura por capas **Controlador → Servicio → Repositorio**:

- Las **rutas** asocian los endpoints HTTP con los controladores.
- Los **controladores** reciben la petición y envían la respuesta.
- Los **servicios** contienen las reglas de negocio (validación, normalización, números de caso, consulta, login, flujo de estados).
- Los **repositorios** ejecutan las consultas SQL. Los repositorios del personal están separados del público, de modo que las rutas públicas no pueden alcanzarlos.
- Los **middlewares** añaden el identificador de petición, comprimen las respuestas, limitan los intentos, verifican la sesión del personal y el token CSRF, y convierten los errores en JSON.

Más detalles en [docs/architecture.md](./docs/architecture.md). La API está documentada en [docs/api.md](./docs/api.md). Esa documentación está en inglés.

```
pqrs-flow/
├── backend/        # API REST (Express) y capa de base de datos
├── frontend/       # Interfaz web pública (radicar y consultar)
├── frontend-admin/ # Panel del personal, servido bajo /admin tras un login
├── shared/         # Código usado tanto por el navegador como por el servidor
├── docs/           # Requisitos, arquitectura, referencia de la API
└── .github/        # Flujo de CI y plantillas
```

---

## 🚀 Primeros pasos

### Requisitos previos

- [Node.js](https://nodejs.org/) 22 o superior
- [Git](https://git-scm.com/)

### Instalación local

```bash
git clone https://github.com/OAlexProgramerO/pqrs-flow.git
cd pqrs-flow
cp .env.example .env
npm run install:all
npm run dev
```

En Windows PowerShell, el equivalente de `cp` es `Copy-Item .env.example .env`.

Luego abre:

- Frontend: <http://localhost:3000>
- Salud de la API: <http://localhost:3000/api/health>

Para ver datos sin escribirlos, añade solicitudes de demostración con `npm run seed`. Imprime un número de caso y un correo que puedes usar en la página de consulta (`/track.html`). Para empezar con una base de datos vacía, ejecuta `npm run db:reset`.

### Panel del personal: crear el primer administrador

**No hay cuentas por defecto.** El panel permanece cerrado hasta que crees una en la máquina que ejecuta el servidor:

```bash
npm run admin -- create --email you@example.com --name "Your Name"
```

El comando pide la contraseña dos veces y no muestra lo que escribes. Necesita al menos 12 caracteres. Para scripts, envíala por la entrada estándar (nunca como argumento, porque los argumentos quedan en el historial del shell y en la lista de procesos):

```bash
printf '%s' "$PASSWORD" | npm run admin -- create --email you@example.com --name "Your Name" --password-stdin
```

Luego abre <http://localhost:3000/admin/> e inicia sesión. Otros comandos:

| Comando                                       | Qué hace                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run admin -- list`                       | Muestra las cuentas y si están activas                                                      |
| `npm run admin -- reset-password --email ...` | Define una contraseña nueva y cierra todas las sesiones de esa cuenta (contraseña olvidada) |
| `npm run admin -- deactivate --email ...`     | Bloquea una cuenta y cierra sus sesiones al instante                                        |
| `npm run admin -- activate --email ...`       | Permite de nuevo una cuenta desactivada                                                     |

La herramienta usa la misma base de datos que el servidor (`DB_PATH`). Usa la terminal para crear el primer administrador o recuperar el acceso si ningún administrador puede iniciar sesión; después, los administradores pueden crear y gestionar cuentas desde el panel protegido. Si los límites de login te bloquean, espera a que pase la ventana o reinicia el servidor (los contadores viven en memoria).

Después de crear la primera cuenta, usa `/admin/accounts.html` para añadir cuentas de personal o administradores. Las cuentas nuevas usan por defecto el rol menos privilegiado (`staff`) y deben cambiar la contraseña inicial en el primer inicio de sesión. Las cuentas existentes se migran como administradores para conservar el acceso previo. Siempre debe quedar al menos un administrador activo; un administrador no puede degradar ni desactivar su propia cuenta.

### Configuración

| Variable                           | Valor por defecto           | Descripción                                                                               |
| ---------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `PORT`                             | `3000`                      | Puerto del servidor                                                                       |
| `NODE_ENV`                         | `development`               | `production` desactiva los comandos seed y reset                                          |
| `DB_PATH`                          | `data/pqrs.db`              | Archivo SQLite. Las rutas relativas parten de la raíz del proyecto.                       |
| `SUBMIT_RATE_LIMIT_MAX`            | `10`                        | Solicitudes nuevas que una dirección de cliente puede enviar en cada ventana              |
| `SUBMIT_RATE_LIMIT_WINDOW_MINUTES` | `15`                        | Duración de esa ventana en minutos                                                        |
| `TRUST_PROXY`                      | vacío (desactivado)         | Número de proxies inversos delante de la app, por ejemplo `1`. Ver la nota más abajo.     |
| `CORS_ORIGINS`                     | vacío (ninguno)             | Sitios web autorizados a llamar a la API desde un navegador, separados por comas, o `*`   |
| `STATIC_CACHE_SECONDS`             | `0`, o `3600` en producción | Segundos que un navegador puede conservar estilos, scripts e imágenes                     |
| `SESSION_IDLE_MINUTES`             | `30`                        | Una sesión del personal termina tras estos minutos sin uso                                |
| `SESSION_MAX_HOURS`                | `8`                         | Una sesión del personal termina tras estas horas, aunque se use todo el tiempo            |
| `SESSION_COOKIE_SECURE`            | `true` en producción        | Añade `Secure` a la cookie, para que solo viaje por HTTPS. Mantenlo activo en producción. |
| `LOGIN_RATE_LIMIT_MAX`             | `10`                        | Intentos de login del personal por dirección de cliente en cada ventana                   |
| `LOGIN_ACCOUNT_RATE_LIMIT_MAX`     | `5`                         | Intentos de login del personal por cuenta en cada ventana                                 |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES`  | `15`                        | Duración de la ventana de login en minutos                                                |

Los administradores gestionan las reglas de plazos y los festivos mediante los endpoints protegidos documentados en [docs/api.md](./docs/api.md). No hay valores precargados. El cálculo usa UTC, considera la fecha de radicación como día cero y omite fines de semana y festivos configurados. El indicador de cinco días hábiles es una alerta operativa, no una regla legal. Verifica los plazos con fuentes jurisdiccionales autorizadas y la política de la organización; PQRS Flow no afirma cumplir la ley.

**Área del personal en producción:** sirve la aplicación por HTTPS (la cookie es `Secure` y usa el prefijo `__Host-`, así que no funciona por HTTP simple), define `TRUST_PROXY` con el número de proxies para que los límites de login vean la dirección real, y lee [docs/security.md](./docs/security.md). El panel del personal funciona solo desde la misma dirección que el sitio público: CORS nunca se abre para él.

**Detrás de un proxy inverso** (Nginx, Render, Railway...) define `TRUST_PROXY` con el número de proxies, normalmente `1`. Sin eso, el servidor ve la dirección del proxy para todos los visitantes, así que todos compartirían un mismo límite de frecuencia. Déjalo vacío cuando nadie esté delante de la aplicación, porque confiar en `X-Forwarded-For` sin un proxy permite que cualquiera falsifique su dirección. Evita `TRUST_PROXY=true` por la misma razón.

### Probar la API

Abre [docs/requests.http](./docs/requests.http) en VS Code con la extensión REST Client, o ejecuta:

```bash
curl -X POST http://localhost:3000/api/pqrs \
  -H "Content-Type: application/json" \
  -d '{"type":"petition","subject":"Street light is broken","description":"The street light in front of my house has been off for two weeks.","requesterName":"Ana Gomez","requesterEmail":"ana@example.com"}'
```

## 📜 Scripts disponibles

| Comando            | Descripción                                                  |
| ------------------ | ------------------------------------------------------------ |
| `npm run dev`      | Inicia el servidor Express con recarga automática            |
| `npm start`        | Inicia el servidor                                           |
| `npm test`         | Ejecuta las pruebas con el ejecutor nativo de Node           |
| `npm run lint`     | Busca problemas de código con ESLint                         |
| `npm run format`   | Formatea todos los archivos con Prettier                     |
| `npm run check`    | Ejecuta lint, verificación de formato y pruebas en secuencia |
| `npm run seed`     | Añade solicitudes de demostración a la base de datos local   |
| `npm run db:reset` | Borra la base de datos local y sus archivos WAL              |
| `npm run admin --` | Gestiona las cuentas del personal (ver arriba)               |

`shutdown-signal.test.js` inicia el servidor real y lo detiene con `SIGINT` y `SIGTERM`. Se omite en Windows, donde no se pueden entregar señales a un proceso hijo, y se ejecuta en la CI en Linux. El resto de las pruebas se ejecuta en todas partes.

Para ejecutar un solo archivo de pruebas usa `npm --prefix backend test -- tests/admin-audit.test.js`. Pasar por `npm` es importante: da a las pruebas una base de datos temporal, de modo que nunca tocan `data/pqrs.db`.

## 🩺 Solución de problemas

| Problema                                               | Solución                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `EADDRINUSE` al iniciar                                | Otro proceso usa el puerto. Cambia `PORT` en `.env`.                                                                        |
| La página de consulta dice "Too many attempts"         | La consulta permite 8 intentos por número de caso cada 15 minutos. Espera, o reinicia el servidor en desarrollo.            |
| El formulario dice "Too many attempts"                 | Cada dirección puede enviar 10 solicitudes cada 15 minutos. Espera, o aumenta `SUBMIT_RATE_LIMIT_MAX` en `.env`.            |
| El navegador bloquea la API con un error de CORS       | La página la sirve otro sitio o puerto (por ejemplo Live Server). Añade su dirección a `CORS_ORIGINS`.                      |
| Un script o estilo modificado no aparece en producción | Los navegadores los conservan durante `STATIC_CACHE_SECONDS`. Redúcelo, o fuerza una recarga con Ctrl+F5.                   |
| Todos los visitantes se bloquean al mismo tiempo       | La app está detrás de un proxy. Define `TRUST_PROXY=1` en el entorno del servidor.                                          |
| El pie de página dice que no puede alcanzar la API     | Inicia el servidor con `npm run dev`.                                                                                       |
| `better-sqlite3` falla al instalarse                   | Usa Node 22 o 24 para que se descargue el binario precompilado.                                                             |
| Siguen apareciendo datos antiguos                      | Ejecuta `npm run db:reset` y, si quieres datos de demostración, `npm run seed`.                                             |
| El login dice "Invalid email or password."             | Revisa ambos datos. El mensaje es el mismo para una contraseña incorrecta, una cuenta desconocida y una desactivada.        |
| El login dice "Too many attempts"                      | Espera a que pase la ventana (15 minutos por defecto) o reinicia el servidor. Aumenta `LOGIN_RATE_LIMIT_MAX` si hace falta. |
| El login funciona pero el panel me devuelve al login   | En producción la cookie es `Secure`: usa HTTPS. No definas `SESSION_COOKIE_SECURE=false` en producción.                     |
| "Cross-origin request blocked" en el panel             | La página se abrió desde una dirección distinta a la del servidor (por ejemplo Live Server). Usa la dirección del servidor. |
| Olvidé mi contraseña                                   | En el servidor: `npm run admin -- reset-password --email you@example.com`.                                                  |

## 🗺️ Versiones futuras

El objetivo es un sistema PQRS completo, construido un paso pequeño y probado a la vez. La versión 0.3.2 sigue en curso para completar la interfaz de trabajo del personal; la gestión de plazos 0.3.3 está implementada localmente, pero aún no se publica. Las versiones posteriores siguen planeadas. El orden puede cambiar. Los nombres de las ramas y las razones de cada decisión están en [ROADMAP.md](./ROADMAP.md).

| Versión | Trabajo                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.3.1   | **Cuentas y roles del personal.** Entregado: acceso por roles, gestión de cuentas, cambios obligatorios de contraseña, cambio propio, gestión de sesiones y auditoría de cuentas.                            |
| 0.3.2   | **Respuestas y notas internas.** El texto de respuesta que la ciudadanía puede leer al consultar, notas privadas entre el personal, asignación de una solicitud a una persona y visor de auditoría de PQRS.  |
| 0.3.3   | **Plazos (implementado localmente).** Reglas configurables de días hábiles y festivos, instantáneas inmutables de fechas límite e indicadores solo para el personal.                                         |
| 0.3.4   | **Adjuntos.** Cargas seguras (verificación de tamaño, tipo y contenido, archivos fuera de la raíz web) para ciudadanos y personal.                                                                           |
| 0.3.5   | **Notificaciones por correo.** Correo al recibir una solicitud y al responderla, con una bandeja de salida y reintentos para que un fallo de correo nunca pierda una solicitud.                              |
| 0.4.0   | **Reportes.** Solicitudes por tipo y estado a lo largo del tiempo, tiempo promedio de respuesta, tasa de vencimiento.                                                                                        |
| 0.4.1   | **Exportación CSV.** Exportación en flujo de la lista filtrada, con protección contra la inyección de fórmulas en hojas de cálculo.                                                                          |
| 0.5.0   | **Calidad.** Informe de cobertura, una prueba de extremo a extremo de todo el flujo en un navegador real, una verificación automática de accesibilidad.                                                      |
| 0.5.1   | **Endurecimiento de la autenticación.** Segundo factor (TOTP), límites de login y sesiones que sobreviven a un reinicio y funcionan con más de un proceso del servidor, un registro de eventos de seguridad. |
| 0.5.2   | **Docker.** Imagen multi-etapa y `docker compose`.                                                                                                                                                           |
| 0.5.3   | **Despliegue.** Despliegue en la nube, CI/CD y copias de seguridad automáticas de la base de datos.                                                                                                          |
| 0.9.0   | **Candidata a versión final.** Congelación de funcionalidades, datos de demostración, capturas de pantalla y documentación final.                                                                            |
| 1.0.0   | **Primera versión estable** con una demostración pública.                                                                                                                                                    |

### Límites conocidos de la implementación actual

Son deliberados y son la razón de algunas de las versiones anteriores:

- Todos los usuarios activos de ambos roles pueden ver y modificar todas las solicitudes; todavía no hay restricciones por asignación.
- El personal puede cambiar el estado, pero todavía no puede escribir una respuesta al ciudadano ni notas (0.3.2).
- Los límites de login y las sesiones del personal están pensados para **un solo proceso del servidor**. Los contadores de límites viven en memoria y se reinician con el servidor. Con varias instancias detrás de un balanceador, los límites serían por instancia (0.5.1).
- No hay segundo factor ni correo, por lo que no existe un enlace de "olvidé mi contraseña": la recuperación requiere acceso al servidor (0.5.1, 0.3.5).
- Un login cuenta cada intento para el límite de la cuenta, así que quien conozca un correo puede hacer esperar a esa cuenta. El personal aún puede recuperarse desde la terminal.
- Los inicios de sesión y sus fallos no se registran en una bitácora de eventos de seguridad. Los cambios de cuenta, contraseña y sesiones sí quedan en la auditoría append-only de cuentas; los cambios de estado tienen su propia auditoría. Una bitácora de eventos más amplia está planeada para 0.5.1.
- Lo mismo ocurre con la consulta pública: permite 8 intentos por número de caso cada 15 minutos, así que quien conozca un número de caso puede hacer esperar a su verdadero dueño. Esto no expone ningún dato. Ver [docs/security.md](./docs/security.md).
- La búsqueda ignora mayúsculas y minúsculas solo para las letras del inglés (un límite del `LIKE` de SQLite), y las fechas de los filtros están en UTC.
- Que las pruebas automáticas pasen no significa que el sistema esté listo para producción. Revisa [docs/security.md](./docs/security.md) y pruébalo en tu entorno primero.

## 🤝 Contribuir

Los nombres de las ramas, las convenciones de commits (Conventional Commits), los números de versión y el proceso de publicación se describen en [CONTRIBUTING.md](./CONTRIBUTING.md).

## 🏷️ Versionado

Este proyecto sigue el [Versionado Semántico](https://semver.org) adaptado a fases de aprendizaje:

- `0.X.0`: una capacidad nueva para los usuarios, entregada en un pull request.
- `0.X.Y`: el siguiente paso dentro de la misma fase.
- `1.0.0`: primera versión estable con una demostración pública.

El plan está en [ROADMAP.md](./ROADMAP.md) y el historial completo en [CHANGELOG.md](./CHANGELOG.md).

## 📄 Licencia

MIT. Ver [LICENSE](./LICENSE).
