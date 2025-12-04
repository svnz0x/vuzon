**vuzon** es una UI ligera que usa la **API de Cloudflare Email Routing** para crear y gestionar **alias** y **destinatarios** de forma sencilla.

- 🚀 **Autohospedaje**: despliega tu propia instancia con **Docker Compose**.
- ☁️ **Servicio oficial**: también puedes usar https://vuzon.cc/ (actualmente **beta privada**).
- 🧩 Backend en **Node/Express** con proxy a los endpoints de Cloudflare.

> Qué es Email Routing: https://developers.cloudflare.com/email-routing/

---

## Tabla de contenidos
- [Características](#características)
- [Requisitos](#requisitos)
- [Variables de entorno](#variables-de-entorno)
- [Despliegue con Docker Compose](#despliegue-con-docker-compose)
- [Ejecución local sin Docker](#ejecución-local-sin-docker)
- [Rutas del backend](#rutas-del-backend)
- [Uso básico](#uso-básico)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

---

## Características
- Crear **alias/reglas** que enrutan correos a **destinatarios verificados**.
- Listado y gestión de **destinatarios** (añadir/eliminar).
- **Habilitar/Deshabilitar** reglas desde la UI.
- **Activar Email Routing** en la zona (añade/bloquea MX y SPF requeridos).
- UI responsive y PWA (manifest + iconos).

---

## Requisitos
- Un dominio en Cloudflare con **Email Routing** disponible.
- Un **API Token** de Cloudflare con permisos mínimos (ver **Seguridad**).
- Docker (para despliegue con Compose) o Node.js ≥ 18 (para ejecución local).

---

## Variables de entorno

Crea un `.env` en la raíz del proyecto:

```env
# Cloudflare Email Routing
CF_API_TOKEN=
CF_ACCOUNT_ID=
CF_ZONE_ID=
DOMAIN=

# App
NODE_ENV=production
PORT=8001
BASE_URL=

# AUTH
AUTH_USER=
AUTH_PASS=
SESSION_SECRET=
```

---

## Despliegue con Docker Compose

> Consejo: el repositorio incluye un `.dockerignore` que excluye dependencias, logs y archivos de entorno, reduciendo el contexto de build y logrando imágenes más ligeras y compilaciones más rápidas.


```yaml
services:
  vuzon:
    image: ghcr.io/svnz0x/vuzon
    env_file:
      - .env
    restart: unless-stopped
    ports:
      - "8001:8001"
```


**Levantar:**

```bash
docker compose up -d
# Abre http://localhost:8001
```

---

## Ejecución local sin Docker

```bash
npm install
npm start
# App en http://localhost:8001
```

> Requiere Node.js ≥ 18.

---

## Rutas del backend

El backend expone un proxy REST hacia Cloudflare:

- `GET  /api/addresses` — Lista destinatarios.
- `POST /api/addresses` — Crea destinatario `{ email }`.
- `DELETE /api/addresses/:id` — Elimina destinatario.

- `GET  /api/rules` — Lista reglas/alias.
- `POST /api/rules` — Crea regla `{ localPart, destEmail }` (el `localPart` se recorta y solo admite letras, números, puntos y guiones; `destEmail` debe ser un correo válido).
- `DELETE /api/rules/:id` — Elimina regla.
- `POST /api/rules/:id/enable` — Habilita regla.
- `POST /api/rules/:id/disable` — Deshabilita regla.

- `POST /api/enable-routing` — Activa Email Routing en la zona (añade/bloquea MX y SPF).

> Referencias de API (Cloudflare): reglas, direcciones y activación DNS en la documentación oficial.

---

## Uso básico

1. **Activa Email Routing** en tu zona (desde la UI o dashboard de Cloudflare).  
2. Añade una **dirección de destino** (se enviará un correo de verificación).  
3. Crea un **alias (regla)** eligiendo *local-part* y el **destino verificado**.

---

## Seguridad

- Usa **API Tokens** con **privilegios mínimos** en lugar de la Global API Key.
- Ubica la app tras un *reverse proxy* con **TLS** y, si procede, añade **autenticación**.

**Scopes mínimos sugeridos para el token:**
- **Account → Email Routing Addresses: Read & Edit**
- **Zone → Email Routing Rules: Read & Edit**
- **Zone → Email Routing DNS: Edit** (solo si vas a activar Email Routing por API)
