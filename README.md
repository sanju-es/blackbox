# Blackbox

![Página de configuración](assets/configuration.jpeg)

Interfaz web y servicio de archivos para el
[blackbox_exporter](https://github.com/prometheus/blackbox_exporter) de Prometheus.
Edita el `blackbox.yml` montado, lo mantiene válido y ejecuta comprobaciones HTTP/S
con **NTLM**, una función que el exportador original no ofrece.

> **Aviso.** Desarrollado por **sanju**
> ([github.com/sanju-es](https://github.com/sanju-es)). Es un proyecto personal,
> entregado tal cual, sin garantía. Cualquier código escrito con ayuda de IA debe
> revisarse antes de usarlo. El autor no asume responsabilidad por su uso en
> producción ni por cualquier consecuencia derivada. Las métricas generadas pueden
> tener ligeras desviaciones.

> **Crédito.** Nada de esto está inventado. El modelo de configuración, la semántica
> de los módulos, los nombres de las métricas y el comportamiento de las sondas
> provienen del [blackbox_exporter de Prometheus](https://github.com/prometheus/blackbox_exporter)
> y de sus creadores. No es un fork ni una reescritura de su trabajo; es un frontend
> independiente y un pequeño servicio Node que sigue su referencia, para que este
> despliegue pueda añadir la comprobación NTLM que necesita. **El mérito es suyo.**

### Qué es

- Una interfaz React 19 + TypeScript que lee, edita y guarda el `blackbox.yml`
  montado en la imagen, con un formulario por prober y una vista previa YAML exacta.
  También sirve como GUI para construir el YAML del exportador original para HTTP,
  HTTPS y los demás módulos documentados; la excepción es NTLM, que es una extensión
  propia de este servicio, así que un módulo que lo use no funcionará con el
  exportador original.
- Un pequeño servicio Node que posee el archivo, lo valida y ejecuta las
  comprobaciones él mismo: HTTP/S con autenticación Basic o NTLM, opciones TLS,
  redirecciones, códigos de estado, expresiones regulares de cuerpo y cabeceras;
  comprobaciones TCP de solo conexión; y consultas DNS por UDP.
- Un montaje de escritura sirve la página de configuración y la superficie de probe:
  `/` es la puerta del token, `/app` la interfaz, y `/probe` y `/metrics` responden
  al lado, con el token obligatorio para `/probe`. En un montaje de solo lectura `/`
  responde el aviso de escritura y el historial en texto de `/history` es opcional
  con `CHECKER_METRICS_ENABLED` y `CHECKER_HISTORY_ENABLED` (ambos `false` por
  defecto).
- Un historial de las últimas 50 ejecuciones, en memoria, una línea de texto cada
  una: `startedAt · target · module · outcome`.
- Un modal de comprobación rápida para pruebas puntuales sin escribir el archivo,
  que puede crear una configuración de probe a partir de lo probado.

Las comprobaciones siguen las métricas `probe_http_*` del exportador: fases de DNS,
conexión, TLS, espera (primer byte) y descarga, protocolo e IP y hash, versión HTTP,
longitud del contenido, versión y cifrado TLS y expiración del certificado. Las rutas
de probe reciben host, puerto y ruta; `http://` o `https://` en el destino se
rechaza. El `http.scheme` del módulo elige el esquema, con `https` para
`prober: https` y `http` en el resto.

### Inicio rápido

Requiere Node 24 o superior.

```bash
npm install
npm run build
CONFIG_FILE=examples/blackbox.yml PORT=9115 npm run server
```

Abre `http://localhost:9115`. Con el archivo escribible, la raíz es la puerta del
token; la interfaz vive en `/app`, y `/probe` y `/metrics` responden al lado (la
sonda necesita su token). Con el archivo de solo lectura, `/` responde el aviso de
escritura, `/probe` responde, y `/metrics` y `/history` responden solo mientras sus
interruptores estén activos. `npm run dev` arranca Vite en `5173` y hace proxy al
servicio.

### Entorno

| Variable | Por defecto | Efecto |
|---|---|---|
| `PORT` | `9115` | puerto en el que escucha el servicio |
| `CONFIG_FILE` | `/config/blackbox.yml` | archivo de configuración montado |
| `STATIC_DIR` | `dist` | interfaz compilada |
| `CHECKER_METRICS_ENABLED` | `false` | sirve `/metrics`; apagado responde `404` |
| `CHECKER_HISTORY_ENABLED` | `false` | sirve `/history` como texto; apagado responde `404` |

### Token de servicio

Un montaje escribible siempre lleva un `service.token`; cuando el archivo no tiene
ninguno, el servicio genera uno al arrancar, lo escribe y se reinicia. En un montaje
de solo lectura es opcional:

```yaml
service:
  token: "replace-with-16-to-64-characters"
```

Con él, la raíz es una pequeña página de token que entrega el valor aceptado a la
interfaz en el fragmento de la URL; `/probe` acepta `?token=...` y todas las rutas
`/api` aceptan `Authorization: Bearer ...`. El token se mantiene solo en memoria;
nunca se guarda en el navegador ni en el bundle. **Generate token**, bajo la vista
previa de configuración, lo rota y muestra el valor nuevo una vez.

### Estructura

| Ruta | Contenido |
|---|---|
| `shared/document/` | modelo YAML, parser, serializador y validación |
| `server/` | servicio de archivos, motor HTTP/S con NTLM, `/probe` y `/metrics` |
| `src/app/` | shell y puerta de modo |
| `src/features/configuration/` | módulo de configuración |

### Nota sobre NTLM

La comprobación NTLM realiza el handshake HTTP NTLM/Negotiate con `httpntlm`
vendorizado sobre la misma conexión TCP. No es un formulario de login: si el destino
pide credenciales mediante un formulario web, esta comprobación no aplica. El prober
HTTP del exportador no admite NTLM, que es la razón de existir de este proyecto.

### Proyectos originales

- [prometheus/blackbox_exporter](https://github.com/prometheus/blackbox_exporter)
- [prometheus/prometheus](https://github.com/prometheus/prometheus)

### Licencia

ISC — consulta [LICENSE](LICENSE).

Copyright (c) 2026 sanju-es.
