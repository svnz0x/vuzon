<p align="center">
  <img src="./public/icons/icon-192.png" alt="vuzon" width="200"/>
</p>

<p align="center">
  <a href="https://ko-fi.com/F2F81PNZRL">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="ko-fi"/>
  </a>
</p>

<p align="center">
  <a href="https://github.com/svnz0x/vuzon/stargazers">
    <img src="https://img.shields.io/github/stars/svnz0x/vuzon?style=social" alt="GitHub stars"/>
  </a>
  &nbsp;
  <a href="https://github.com/svnz0x/vuzon/issues">
    <img src="https://img.shields.io/github/issues/svnz0x/vuzon" alt="GitHub issues"/>
  </a>
  &nbsp;
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/svnz0x/vuzon" alt="License"/>
  </a>
  &nbsp;
  <img src="https://img.shields.io/github/last-commit/svnz0x/vuzon" alt="Last commit"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/frontend-Alpine.js-8BC0D0?logo=alpinedotjs&logoColor=white" alt="Alpine.js"/>
  &nbsp;
  <img src="https://img.shields.io/badge/backend-Node.js%20%2B%20Express-339933?logo=nodedotjs&logoColor=white" alt="Node.js + Express"/>
  &nbsp;
  <img src="https://img.shields.io/badge/infra-Docker%20%2B%20Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Docker + Docker Compose"/>
</p>

# vuzon

UI ligera que usa la **API de Cloudflare Email Routing** para crear y gestionar **alias** y **destinatarios** de forma sencilla.

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

**Scopes mínimos sugeridos para el token:**
- **Account → Email Routing Addresses: Read & Edit**
- **Zone → Email Routing Rules: Read & Edit**
- **Zone → Email Routing DNS: Edit** (solo si vas a activar Email Routing por API)

```env
# Cloudflare Email Routing (Requerido)
CF_API_TOKEN=
CF_ACCOUNT_ID=
CF_ZONE_ID=
DOMAIN=

# Acceso a Vuzon (Requerido)
AUTH_USER=
AUTH_PASS=

# URL pública, útil si usas HTTPS para asegurar las cookies (Opcional) 
# BASE_URL=https://vuzon.midominio.com
# NODE_ENV=production
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
      # Mapea el puerto del host (configurable o 8001 por defecto) al 8001 fijo del contenedor
      - "${VUZON_PORT:-8001}:8001"
    volumes:
      - ./sessions:/app/sessions
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
