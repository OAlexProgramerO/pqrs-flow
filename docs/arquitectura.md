# Arquitectura

```
Navegador ──HTTP──► Express (backend/)
   │                   ├── /api/*      → rutas REST (JSON)
   │                   └── /           → archivos estáticos de frontend/
   └── frontend/ (HTML + CSS + JS)
```

## Decisiones

| Decisión | Elección | Motivo |
| --- | --- | --- |
| Módulos | ES Modules (`"type": "module"`) | Estándar actual de JavaScript |
| Frontend | Estático servido por Express | Un solo comando para correr todo en las primeras fases |
| Pruebas | `node:test` nativo | Cero dependencias extra |
| Config | Variables de entorno (`.env`) | Mismo código en local y producción |

## Capas del backend (a medida que crezca)

```
routes/       → define endpoints
controllers/  → recibe la petición y responde
services/     → reglas de negocio
repositories/ → acceso a base de datos
```

Las carpetas `controllers/`, `services/` y `repositories/` se crearán cuando haya lógica que las justifique (v0.1.0 en adelante).
