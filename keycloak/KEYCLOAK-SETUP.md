# Keycloak Setup Guide

This guide covers how to configure Keycloak as the identity provider for ReArch
when using `AUTH_MODE=KEYCLOAK_FIREWALL` . hola que tl estás

ReArch requires three Keycloak clients within a single realm. A realm export
file is provided at `keycloak/realm-export.json` and will be auto-imported on
first boot if the Keycloak container is configured with `KC_IMPORT`. If you
prefer to configure Keycloak manually, or need to adjust settings after the
initial import, follow the steps below.

---

## Prerequisites

- A running Keycloak instance accessible at your chosen domain (e.g.
  `https://auth.example.com`)
- Admin access to the Keycloak admin console
- Your ReArch frontend URL (e.g. `https://app.example.com`)

Throughout this guide, replace:
- `https://auth.example.com` with your Keycloak URL
- `https://app.example.com` with your frontend URL
- `https://*.example.com` with your wildcard domain (used for conversation
  containers)

---

## Step 1: Create the Realm

1. Log in to the Keycloak admin console at `https://auth.example.com/admin`
2. Click the realm dropdown in the top-left corner
3. Click **Create realm**
4. Set the **Realm name** to `rearch`
5. Click **Create**

### Realm Settings

After creating the realm, go to **Realm settings** and configure:

| Setting | Value |
|---|---|
| Display name | `ReArch` |
| User registration | Off |
| Login with email | On |
| Duplicate emails | Off |
| Reset password | On |
| Edit username | Off |
| Brute force detection | On |

---

## Step 2: Create Realm Roles

Go to **Realm roles** in the left sidebar.

### Role: `user`

1. Click **Create role**
2. Role name: `user`
3. Description: `Standard user role`
4. Click **Save**

### Role: `admin`

1. Click **Create role**
2. Role name: `admin`
3. Description: `Administrator role`
4. Click **Save**

### Set Default Role

1. Go to **Realm settings** > **User registration** tab (or **Default roles**)
2. Add `user` to the default roles

This ensures every new user is automatically assigned the `user` role on first
login.

---

## Step 3: Create the Client Scope

ReArch expects realm roles to be included in the access token under a
`realm_roles` claim. Create a custom client scope to ensure this.

1. Go to **Client scopes** in the left sidebar
2. Click **Create client scope**
3. Configure:
   - Name: `roles`
   - Description: `OpenID Connect scope for roles`
   - Protocol: `OpenID Connect`
   - Include in token scope: On
4. Click **Save**

### Add a Protocol Mapper

1. In the `roles` client scope, go to the **Mappers** tab
2. Click **Add mapper** > **By configuration** > **User Realm Role**
3. Configure:

| Setting | Value |
|---|---|
| Name | `realm roles` |
| Multivalued | On |
| Token Claim Name | `realm_roles` |
| Claim JSON Type | `String` |
| Add to ID token | On |
| Add to access token | On |
| Add to userinfo | On |

4. Click **Save**

---

## Step 4: Create the Clients

ReArch uses three Keycloak clients, each with a different purpose.

### Client 1: `rearch-app` (Frontend SPA)

This is a public client used by the React frontend to authenticate users via
the Authorization Code flow with PKCE.

1. Go to **Clients** > **Create client**
2. **General settings:**
   - Client ID: `rearch-app`
   - Name: `ReArch Frontend`
   - Description: `Frontend SPA application (public client)`
3. **Capability config:**

| Setting | Value |
|---|---|
| Client authentication | **Off** |
| Authorization | **Off** |
| Standard flow | Checked |
| Direct access grants | Unchecked |
| Implicit flow | Unchecked |
| Service accounts roles | Unchecked |
| OAuth 2.0 Device Authorization Grant | Unchecked |
| OIDC CIBA Grant | Unchecked |

4. **Login settings:**

| Setting | Value |
|---|---|
| Root URL | `https://app.example.com` |
| Home URL | `https://app.example.com` |
| Valid redirect URIs | `https://app.example.com/*` and `http://localhost:4200/*` |
| Valid post logout redirect URIs | `https://app.example.com/*` and `http://localhost:4200/*` |
| Web origins | `https://app.example.com` and `http://localhost:4200` |

5. Click **Save**

#### Enable PKCE

1. In the `rearch-app` client, go to the **Advanced** tab
2. Under **Advanced settings**, set:
   - Proof Key for Code Exchange Code Challenge Method: `S256`

#### Assign Client Scopes

1. Go to the **Client scopes** tab of `rearch-app`
2. Click **Add client scope**
3. Add `roles` as a **Default** scope
4. Verify that `openid`, `email`, and `profile` are also assigned as default
   scopes

#### Add Realm Roles Mapper

1. Go to the **Client scopes** tab > click on `rearch-app-dedicated`
2. Click **Add mapper** > **By configuration** > **User Realm Role**
3. Configure:

| Setting | Value |
|---|---|
| Name | `realm-roles` |
| Multivalued | On |
| Token Claim Name | `realm_roles` |
| Claim JSON Type | `String` |
| Add to ID token | On |
| Add to access token | On |
| Add to userinfo | On |

4. Click **Save**

---

### Client 2: `rearch-backend` (Backend API)

This is a confidential client used by the backend for service-to-service
communication and token validation.

1. Go to **Clients** > **Create client**
2. **General settings:**
   - Client ID: `rearch-backend`
   - Name: `ReArch Backend`
   - Description: `Backend API service (confidential client)`
3. **Capability config:**

| Setting | Value |
|---|---|
| Client authentication | **On** |
| Authorization | **Off** |
| Standard flow | Unchecked |
| Direct access grants | Unchecked |
| Implicit flow | Unchecked |
| Service accounts roles | Checked |
| OAuth 2.0 Device Authorization Grant | Unchecked |
| OIDC CIBA Grant | Unchecked |

4. Click **Save**

#### Copy the Client Secret

1. Go to the **Credentials** tab
2. Copy the **Client secret**
3. Set it as the `KEYCLOAK_BACKEND_CLIENT_SECRET` environment variable in your
   deployment

#### Assign Client Scopes

1. Go to the **Client scopes** tab
2. Ensure `openid`, `email`, `profile`, and `roles` are assigned as default
   scopes

#### Add Realm Roles Mapper

Follow the same mapper steps as for `rearch-app` above (User Realm Role mapper
with `realm_roles` claim name) on the `rearch-backend-dedicated` scope.

---

### Client 3: `rearch-proxy` (OAuth2 Proxy)

This is a confidential client used by oauth2-proxy for Traefik forward-auth,
protecting conversation containers and other internal routes.

1. Go to **Clients** > **Create client**
2. **General settings:**
   - Client ID: `rearch-proxy`
   - Name: `ReArch OAuth2 Proxy`
   - Description: `OAuth2 proxy for Traefik forward-auth (confidential client)`
3. **Capability config:**

| Setting | Value |
|---|---|
| Client authentication | **On** |
| Authorization | **Off** |
| Standard flow | Checked |
| Direct access grants | Unchecked |
| Implicit flow | Unchecked |
| Service accounts roles | Unchecked |
| OAuth 2.0 Device Authorization Grant | Unchecked |
| OIDC CIBA Grant | Unchecked |

4. **Login settings:**

| Setting | Value |
|---|---|
| Root URL | `https://app.example.com` |
| Valid redirect URIs | `https://app.example.com/oauth2/callback` and `https://*.example.com/oauth2/callback` |
| Web origins | `https://app.example.com` and `https://*.example.com` |

5. Click **Save**

#### Copy the Client Secret

1. Go to the **Credentials** tab
2. Copy the **Client secret**
3. Set it as the `OAUTH2_PROXY_CLIENT_SECRET` environment variable in your
   deployment

#### Assign Client Scopes

1. Go to the **Client scopes** tab
2. Ensure `openid`, `email`, `profile`, and `roles` are assigned as default
   scopes

#### Add Realm Roles Mapper

Follow the same mapper steps as for `rearch-app` above (User Realm Role mapper
with `realm_roles` claim name) on the `rearch-proxy-dedicated` scope.

---

## Step 5: Create Users

### Create your first user

1. Go to **Users** in the left sidebar
2. Click **Add user**
3. Configure:
   - Email: your email address
   - Email verified: On
   - First name / Last name: your name
4. Click **Create**
5. Go to the **Credentials** tab and set a password (toggle off "Temporary" if
   you don't want to be forced to change it on first login)

### Assign the Admin Role

1. In the user's detail page, go to the **Role mapping** tab
2. Click **Assign role**
3. Filter by realm roles
4. Select both `admin` and `user`
5. Click **Assign**

The backend syncs roles from the Keycloak token on every authenticated request.
Once the `admin` role is assigned in Keycloak, the user will have admin
privileges in ReArch immediately on their next request.

---

## Step 6: Configure Environment Variables

Set the following environment variables in your ReArch deployment:

### Backend

| Variable | Value |
|---|---|
| `AUTH_MODE` | `KEYCLOAK_FIREWALL` |
| `KEYCLOAK_REALM_URL` | `https://auth.example.com/realms/rearch` |
| `KEYCLOAK_CLIENT_ID` | `rearch-backend` |
| `KEYCLOAK_CLIENT_SECRET` | Client secret from the `rearch-backend` client |

### Frontend

| Variable | Value |
|---|---|
| `KEYCLOAK_URL` | `https://auth.example.com` |
| `KEYCLOAK_REALM` | `rearch` |
| `KEYCLOAK_CLIENT_ID` | `rearch-app` |

### OAuth2 Proxy

| Variable | Value |
|---|---|
| `OAUTH2_PROXY_PROVIDER` | `keycloak-oidc` |
| `OAUTH2_PROXY_CLIENT_ID` | `rearch-proxy` |
| `OAUTH2_PROXY_CLIENT_SECRET` | Client secret from the `rearch-proxy` client |
| `OAUTH2_PROXY_OIDC_ISSUER_URL` | `https://auth.example.com/realms/rearch` |
| `OAUTH2_PROXY_REDIRECT_URL` | `https://app.example.com/oauth2/callback` |
| `OAUTH2_PROXY_COOKIE_SECRET` | A random 32-byte base64-encoded string |
| `OAUTH2_PROXY_COOKIE_DOMAINS` | `.example.com` |
| `OAUTH2_PROXY_WHITELIST_DOMAINS` | `.example.com` |

To generate a cookie secret:

```bash
openssl rand -base64 32
```

---

## Clients Summary

| Client | Type | Auth Flow | Purpose |
|---|---|---|---|
| `rearch-app` | Public | Authorization Code + PKCE | Frontend SPA login via keycloak-js |
| `rearch-backend` | Confidential | Service Account | Token validation, service-to-service |
| `rearch-proxy` | Confidential | Authorization Code | Traefik forward-auth for conversation containers |

---

## How Roles Work

ReArch recognizes two realm roles:

| Role | Description |
|---|---|
| `user` | Standard user. Assigned by default to all new users. |
| `admin` | Administrator. Access to user management, settings, jobs dashboard, and system configuration. |

Roles are extracted from the Keycloak access token (`realm_access.roles` and
the custom `realm_roles` claim) and synced to the application database on every
authenticated request. Keycloak is the source of truth for role assignments.

### Admin-Protected Features

The following features require the `admin` role:

- User management (`/api/users`)
- Skills management (`/api/skills`)
- Job queue dashboard (`/api/jobs`)
- Usage analytics (`/api/usage`)
- Application settings (logo upload, signup restrictions)

### Promoting a User to Admin

1. Open the Keycloak admin console
2. Go to the `rearch` realm > **Users**
3. Select the user
4. Go to the **Role mapping** tab
5. Click **Assign role** and select `admin`
6. The change takes effect on the user's next API request

---

## Using the Realm Export (Auto-Import)

Instead of configuring everything manually, you can use the provided realm
export file. When Keycloak starts for the first time with the `KC_IMPORT`
environment variable pointing to `keycloak/realm-export.json`, it will
automatically create the realm, roles, client scopes, and all three clients.

After the auto-import, you still need to:

1. **Change the client secrets** for `rearch-backend` and `rearch-proxy`
   (the export contains placeholder values `CHANGE_ME_BACKEND_SECRET` and
   `CHANGE_ME_PROXY_SECRET`)
2. **Update the redirect URIs and web origins** to match your domain (the
   export uses placeholder URLs)
3. **Create your first user** and assign the `admin` role (see Step 5)
4. **Set the environment variables** with the new client secrets (see Step 6)

---

## Troubleshooting

### "Invalid redirect_uri" error during login

The redirect URI sent by the application does not match what is configured in
the Keycloak client. Verify that the **Valid redirect URIs** for `rearch-app`
includes `https://app.example.com/*` (with the trailing wildcard).

### CORS errors in the browser console

The frontend domain is not listed in the **Web origins** of the `rearch-app`
client. Add `https://app.example.com` to the Web origins list. During local
development, also add `http://localhost:4200`.

### "Client not found" error

The `KEYCLOAK_CLIENT_ID` environment variable does not match any client in the
`rearch` realm. Verify the client ID is spelled exactly as created in Keycloak.

### User has no admin access after role assignment

Roles are synced from the Keycloak token. If the user was already logged in
when the role was assigned, they need to make a new API request (or log out and
back in) for the updated token to be issued.

### "Unauthorized" when accessing the frontend

If using Traefik with forward-auth middleware on the frontend router, remove it.
The frontend handles authentication directly via keycloak-js and must be
publicly accessible so the SPA can load before initiating the login flow.
Forward-auth should only be used on conversation container routes and other
backend services that need proxy-level protection.

### Token validation fails on the backend

Verify that `KEYCLOAK_REALM_URL` points to the correct realm URL
(`https://auth.example.com/realms/rearch`) and that the backend can reach
Keycloak's JWKS endpoint at
`https://auth.example.com/realms/rearch/protocol/openid-connect/certs`.

---

## Security Considerations

- Always use HTTPS for all endpoints in production
- Rotate client secrets periodically and update the corresponding environment
  variables
- Use PKCE (S256) for the frontend client to prevent authorization code
  interception
- Keep the `rearch-backend` client restricted to service account flows only
  (no browser-based flows)
- Review and restrict the Keycloak "first broker login" flow if using external
  identity providers (see `PINGID-SETUP.md`)
- Enable brute force protection in the realm settings
- Set appropriate token lifespans based on your security requirements
