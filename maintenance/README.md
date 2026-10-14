# Mantenimiento 0.2.x → 0.3.0

Esta carpeta no forma parte de la aplicación: no se carga al arrancar el servidor y no se necesita para ejecutarla. Puedes borrarla antes de subir el proyecto si no la quieres en el repositorio.

## Qué contiene

| Archivo                  | Para qué sirve                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0.2.0-to-0.3.0.patch`   | Todos los cambios entre `0.2.0` (commit `ffb8cf1`) y `0.3.0`. Sirve si prefieres aplicar un parche a tu copia actual en lugar de copiar archivos. |
| `README.md` (este texto) | Qué se arregló, cómo aplicar el parche y los pasos opcionales de tags.                                                                            |

## Qué corrige el parche

| Hallazgo | Qué se hizo                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01     | Apagado limpio con `SIGINT` y `SIGTERM` (`backend/src/shutdown.js`): cierra el servidor y la base de datos SQLite, con un tope de 10 segundos.        |
| F-02     | `frontend-admin/package.json` con `{ "type": "module" }`: desaparece la advertencia `MODULE_TYPELESS_PACKAGE_JSON`.                                   |
| F-03     | Se quitó el BOM UTF-8 de `backend/src/db/database.js` y `backend/tests/helpers/isolate-db.js` (sin otros cambios).                                    |
| F-04     | `CHANGELOG.md` corregido (195 pruebas nuevas en la 0.2.0, 423 en total) y entrada `0.3.0`. Se añadió `README.es.md`.                                  |
| F-07     | `docs/security.md` documenta el límite de la consulta pública (30 por dirección y 8 por número de caso cada 15 minutos), sin cambiar ningún límite.   |
| Pruebas  | 16 pruebas nuevas (el total pasa de 423 a 439). Incluyen una regresión del orden de inicialización de la base de datos de pruebas.                    |
| Versión  | `0.3.0` en `package.json`, `backend/package.json` y sus lockfiles. El roadmap pasó las versiones planeadas a `0.3.1`–`0.3.5` para no repetir números. |

No se cambió ningún endpoint, ninguna migración, ningún límite de frecuencia ni ninguna dependencia.

## Aplicar el parche a una copia 0.2.0

Solo hace falta si tu repositorio está en `ffb8cf1` y no copiaste los archivos de la versión 3.0. Desde la raíz del repositorio, en PowerShell:

```powershell
git status --short            # debe estar limpio
git apply --check maintenance/0.2.0-to-0.3.0.patch
git apply maintenance/0.2.0-to-0.3.0.patch
npm run check
```

Si copiaste los archivos de la versión 3.0, **no** apliques el parche: ya está incluido y `git apply --check` fallará.

## Diferido a propósito

- F-06: el limitador de frecuencia en memoria (planeado en el roadmap para la 0.5.1).
- F-09: retención y borrado de datos, y copias de seguridad automáticas (planeado para la 0.5.3).
- Plazos, adjuntos, correos y reportes: siguen en el roadmap (ahora 0.3.3 y siguientes).

## Tags que faltan (opcional)

El roadmap dice que cada versión lleva un tag, pero el repositorio solo tiene `v0.0.1`, `v0.1.0`, `v0.1.1` y `v0.1.3`. Esto no cambia el código. Si quieres completarlos, comprueba primero a qué commit apuntar con `git show --stat <commit>`. Los candidatos más probables son:

```powershell
git tag v0.1.2 77b03da
git tag v0.2.0 a7ff122
```

Después de hacer tu commit de la versión 0.3.0 (el proceso está en `CONTRIBUTING.md`, apartado _Releases_):

```powershell
git tag v0.3.0
git push origin v0.3.0
```

Nada de esto se ejecutó por ti.
