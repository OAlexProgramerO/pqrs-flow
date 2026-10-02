# Requisitos

## Tipos de solicitud

| Tipo | Descripción |
| --- | --- |
| Petición | Solicitud de información, documento o acción |
| Queja | Inconformidad con la conducta de un funcionario o el servicio |
| Reclamo | Exigencia por un derecho o servicio no prestado correctamente |
| Sugerencia | Propuesta para mejorar el servicio |

## Actores

- **Ciudadano:** radica y consulta (sin necesidad de cuenta).
- **Funcionario:** gestiona y responde casos.
- **Administrador:** gestiona usuarios y configuración.

## Requisitos funcionales (MVP)

1. RF-01: Radicar una PQRS con tipo, asunto, descripción y datos de contacto.
2. RF-02: Generar un número de radicado único.
3. RF-03: Consultar el estado con el número de radicado.
4. RF-04: Ver el historial de cambios de estado.

## Requisitos no funcionales

- RNF-01: Validar toda entrada en el servidor.
- RNF-02: No exponer datos personales en la consulta pública.
- RNF-03: Interfaz usable en celular.
- RNF-04: Pruebas automáticas en rutas críticas.

## Estados de una PQRS

`Radicada → En trámite → Respondida → Cerrada`

> Los plazos de respuesta dependen de la normativa de cada entidad. Se dejarán configurables (fase 0.3).
