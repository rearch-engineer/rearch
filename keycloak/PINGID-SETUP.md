# PingID Identity Broker Setup for Keycloak

This guide configures PingOne (or PingFederate) as an external Identity Provider
in Keycloak, allowing users to "Sign in with PingID" through Keycloak's login page.

## Prerequisites

- A PingOne or PingFederate environment with admin access
- Your Keycloak instance running at `https://auth.rearch.engineer`
- Access to the Keycloak admin console

---

## Step 1: Configure PingOne/PingFederate as an OIDC Application

### In PingOne (Cloud):

1. Log in to the **PingOne Admin Console**
2. Navigate to **Connections > Applications**
3. Click **+ Add Application**
4. Select **OIDC Web App**
5. Configure:
   - **Application Name:** `ReArch Keycloak`
   - **Description:** `Keycloak identity broker for ReArch`
6. In the **Configuration** tab:
   - **Redirect URIs:** `https://auth.rearch.engineer/realms/rearch/broker/pingone/endpoint`
   - **Post Logout Redirect URIs:** `https://auth.rearch.engineer/realms/rearch/broker/pingone/endpoint/logout_response`
   - **Token Endpoint Auth Method:** `Client Secret Post` or `Client Secret Basic`
   - **Grant Types:** `Authorization Code`
   - **PKCE Enforcement:** `Optional` or `S256`
7. In the **Scopes** section, grant:
   - `openid`
   - `email`
   - `profile`
8. **Enable** the application
9. Note down:
   - **Client ID**
   - **Client Secret**
   - **OIDC Discovery URL:** `https://<your-pingone-env>.pingone.com/<environment-id>/as/.well-known/openid-configuration`

### In PingFederate (On-Premise):

1. Log in to the **PingFederate Admin Console**
2. Navigate to **Applications > OAuth Clients**
3. Click **Add Client**
4. Configure:
   - **Client ID:** `rearch-keycloak`
   - **Client Secret:** Generate a secure secret
   - **Redirect URIs:** `https://auth.rearch.engineer/realms/rearch/broker/pingone/endpoint`
   - **Grant Types:** `Authorization Code`
   - **Allowed Scopes:** `openid`, `email`, `profile`
5. Note down:
   - **Client ID**
   - **Client Secret**
   - **Authorization Endpoint:** `https://<your-pingfederate-host>/as/authorization.oauth2`
   - **Token Endpoint:** `https://<your-pingfederate-host>/as/token.oauth2`
   - **Userinfo Endpoint:** `https://<your-pingfederate-host>/idp/userinfo.openid`
   - **JWKS URI:** `https://<your-pingfederate-host>/pf/JWKS`

---

## Step 2: Configure Keycloak Identity Provider

1. Log in to the **Keycloak Admin Console** at `https://auth.rearch.engineer/admin`
2. Select the **rearch** realm
3. Navigate to **Identity Providers** in the left sidebar
4. Click **Add provider** > **OpenID Connect v1.0**

### General Settings:

| Setting              | Value                                           |
|----------------------|-------------------------------------------------|
| Alias                | `pingone`                                       |
| Display Name         | `PingID`                                        |
| Enabled              | `ON`                                            |
| Trust Email          | `ON`                                            |
| First Login Flow     | `first broker login` (default)                  |
| Sync Mode            | `import` (or `force` to always sync attributes) |

### OpenID Connect Settings:

| Setting                     | Value                                                                                 |
|-----------------------------|---------------------------------------------------------------------------------------|
| Discovery Endpoint          | `https://<your-pingone-env>.pingone.com/<env-id>/as/.well-known/openid-configuration` |
| Client Authentication       | `Client secret sent as post` (or `Client secret sent as basic auth`)                  |
| Client ID                   | *(from Step 1)*                                                                       |
| Client Secret               | *(from Step 1)*                                                                       |
| Scopes                      | `openid email profile`                                                                |
| Validate Signatures         | `ON` (recommended)                                                                    |
| Use JWKS URL                | `ON`                                                                                  |
| PKCE Method                 | `S256` (recommended)                                                                  |
| Store Tokens                | `ON` (if you need access tokens from PingID for downstream calls)                     |

5. Click **Save**

---

## Step 3: Configure Attribute Mappers

After saving the identity provider, go to its **Mappers** tab:

### Mapper 1: Email

| Setting          | Value                         |
|------------------|-------------------------------|
| Name             | `email`                       |
| Sync Mode        | `inherit`                     |
| Mapper Type      | `Attribute Importer`          |
| Claim            | `email`                       |
| User Attribute   | `email`                       |

### Mapper 2: First Name

| Setting          | Value                         |
|------------------|-------------------------------|
| Name             | `first-name`                  |
| Sync Mode        | `inherit`                     |
| Mapper Type      | `Attribute Importer`          |
| Claim            | `given_name`                  |
| User Attribute   | `firstName`                   |

### Mapper 3: Last Name

| Setting          | Value                         |
|------------------|-------------------------------|
| Name             | `last-name`                   |
| Sync Mode        | `inherit`                     |
| Mapper Type      | `Attribute Importer`          |
| Claim            | `family_name`                 |
| User Attribute   | `lastName`                    |

### Mapper 4: Username (optional, from PingID `sub`)

| Setting          | Value                         |
|------------------|-------------------------------|
| Name             | `username`                    |
| Sync Mode        | `inherit`                     |
| Mapper Type      | `Username Template Importer`  |
| Template         | `${CLAIM.email}`              |

---

## Step 4: Assign Default Role to Brokered Users

1. In the **rearch** realm, go to **Authentication** > **Flows**
2. Find the **first broker login** flow
3. Ensure the flow includes:
   - **Review Profile** (optional, to let users confirm their profile)
   - **Create User If Unique** (auto-creates the user in Keycloak)
4. Go to **Realm Settings** > **Default Roles**
5. Ensure the `user` role is listed in the default roles
   (PingID users will automatically get the `user` role on first login)

---

## Step 5: (Optional) Make PingID the Default Login

To redirect users directly to PingID instead of showing the Keycloak login page:

1. Go to **Authentication** > **Flows**
2. Create a new **Browser** flow (or duplicate the default)
3. Add an **Identity Provider Redirector** execution
4. Configure it:
   - **Alias:** `pingone-redirector`
   - **Default Identity Provider:** `pingone`
5. Set this flow as the realm's **Browser Flow** under **Authentication** > **Bindings**

Alternatively, keep the Keycloak login page and let users click "PingID" as a
login option alongside any local Keycloak users.

---

## Step 6: Test the Integration

1. Open `https://app.rearch.engineer` in a browser
2. You should be redirected to Keycloak's login page
3. Click **PingID** (or be auto-redirected if configured as default)
4. Authenticate with your PingOne/PingFederate credentials
5. On first login, Keycloak creates a local user linked to the PingID identity
6. You should be redirected back to ReArch with a valid session

---

## Troubleshooting

- **"Invalid redirect_uri":** Ensure the redirect URI in PingOne matches exactly:
  `https://auth.rearch.engineer/realms/rearch/broker/pingone/endpoint`
- **"User not found after broker login":** Check that **Trust Email** is `ON`
  and the email claim is correctly mapped
- **Signature validation failures:** Ensure JWKS URL is correct and Keycloak
  can reach the PingOne/PingFederate JWKS endpoint
- **Role not assigned:** Verify `user` is in the realm's default roles

---

## Security Considerations

- Always use HTTPS for all endpoints
- Rotate client secrets periodically
- Enable PKCE (S256) for the authorization code flow
- Consider enabling "Force" sync mode if PingID is the source of truth for user attributes
- Audit the "first broker login" flow to match your organization's requirements
