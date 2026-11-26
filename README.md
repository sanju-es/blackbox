# Blackbox

![Configuration page](assets/configuration.jpeg)

Web interface and file service for the Prometheus
[blackbox_exporter](https://github.com/prometheus/blackbox_exporter). It edits the
mounted `blackbox.yml`, keeps it valid and runs HTTP/S checks with **NTLM**, a
feature the original exporter does not offer.

> **Disclaimer.** Developed by **sanju**
> ([github.com/sanju-es](https://github.com/sanju-es)). This is a personal
> project, provided as is, with no warranty. Any code written with AI assistance
> must be reviewed before use. The author accepts no liability for its use in
> production or for any consequence of it. The generated metrics may have slight
> deviations.

> **Credit.** Nothing here is invented. The configuration model, the module
> semantics, the metric names and the probe behaviour come from the
> [Prometheus blackbox_exporter](https://github.com/prometheus/blackbox_exporter)
> and its creators. This is not a fork and not a rewrite of their work; it is an
> independent frontend and a small Node service that follows their reference, so
> this deployment can add the NTLM check it needs. **The merit is theirs.**

### What it is

- A React 19 + TypeScript interface that reads, edits and saves the
  `blackbox.yml` mounted in the image, with a form per prober and an exact YAML
  preview. It also works as a GUI to build the YAML of the upstream exporter for
  HTTP, HTTPS and the other documented modules; the exception is NTLM, which is
  this service's own extension, so a module that uses it will not work with the
  upstream exporter.
- A small Node file service that owns the file, validates it and runs the checks
  itself: HTTP/S with Basic or NTLM authentication, TLS options, redirects, status
  codes, body and header regular expressions; TCP connection-only checks; and
  DNS queries over UDP.
- A writable mount serves the configuration page and the probe surface: `/` is
  the token gate, `/app` the interface, and `/probe` and `/metrics` answer beside
  them, with the token required for `/probe`. On a read-only mount `/` answers
  the writability notice and the plain-text history at `/history` is opt-in with
  `CHECKER_METRICS_ENABLED` and `CHECKER_HISTORY_ENABLED` (both `false` by
  default).
- A history of the last 50 runs, kept in memory as one text line each:
  `startedAt · target · module · outcome`.
- A quick-check modal for one-off checks without writing the file, which can
  create a probe configuration from what you tried.

The checks follow the exporter's `probe_http_*` metrics: DNS, connect, TLS,
waiting (first byte) and download phases, IP protocol and hash, HTTP version,
content length, TLS version, cipher and certificate expiry. The probe routes take
a host, port and path; `http://` or `https://` in the target is refused. The
module's `http.scheme` selects the scheme, with `https` for `prober: https` and
`http` otherwise.

### Quick start

Requires Node 24 or newer.

```bash
npm install
npm run build
CONFIG_FILE=examples/blackbox.yml PORT=9115 npm run server
```

Open `http://localhost:9115`. On a writable file the root is the token gate; the
interface lives at `/app`, and `/probe` and `/metrics` answer beside it (the probe
needs its token). When the file is read-only, `/` answers the writability notice,
`/probe` answers, and `/metrics` and `/history` answer only while their switches
are on. `npm run dev` starts Vite on `5173` and proxies the service.

### Environment

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `9115` | port the service listens on |
| `CONFIG_FILE` | `/config/blackbox.yml` | mounted configuration file |
| `STATIC_DIR` | `dist` | built interface |
| `CHECKER_METRICS_ENABLED` | `false` | serves `/metrics`; off answers `404` |
| `CHECKER_HISTORY_ENABLED` | `false` | serves `/history` as plain text; off answers `404` |

### Service token

A writable mount always carries a `service.token`; when the file has none the
service generates one at startup, writes it and restarts. On a read-only mount it
is optional:

```yaml
service:
  token: "replace-with-16-to-64-characters"
```

With it, the root is a small token page that hands the accepted value to the
interface in the URL fragment; `/probe` takes `?token=...` and every `/api` route
takes `Authorization: Bearer ...`. The token is held in memory only; it is never
stored in the browser or in the bundle. **Generate token** below the
configuration preview rotates it and shows the new value once.

### Structure

| Path | Content |
|---|---|
| `shared/document/` | YAML model, parser, serializer and validation |
| `server/` | file service, HTTP/S engine with NTLM, `/probe` and `/metrics` |
| `src/app/` | shell and mode gate |
| `src/features/configuration/` | configuration module |

### NTLM note

The NTLM check performs the HTTP NTLM/Negotiate handshake with the vendored
`httpntlm` on the same TCP connection. It is not a form login: if the target asks for credentials
through a web form, this check does not apply. The exporter's own HTTP prober
does not support NTLM, which is the reason this project exists.

### Upstream projects

- [prometheus/blackbox_exporter](https://github.com/prometheus/blackbox_exporter)
- [prometheus/prometheus](https://github.com/prometheus/prometheus)

### License

ISC — see [LICENSE](LICENSE).

Copyright (c) 2026 sanju-es.
