# ADR 0001: Local-first Zotero authentication

- Status: Accepted
- Date: 2026-07-13

## Context

ThesisOS needs read access to personal and group Zotero libraries. It can run locally beside Zotero Desktop or, later, as a hosted application. These environments have different authentication requirements.

Zotero Desktop exposes a local Web API at `http://localhost:23119/api`. Zotero documents that this local API does not use authentication. Private libraries accessed through `https://api.zotero.org`, however, require an API key. Zotero currently provides OAuth 1.0a as the third-party authorization flow; OAuth 2.0 is not yet available.

## Decision

ThesisOS will use a hybrid, local-first connection model:

1. The default **Connect Zotero** action detects Zotero Desktop and uses its local API without an API key or Zotero login prompt.
2. ThesisOS never asks for or handles a user's Zotero username and password.
3. After connection, ThesisOS discovers personal and group libraries and applies the documented deterministic library-selection flow.
4. When Zotero Desktop is unavailable, a future **Connect Zotero Cloud** action will use Zotero OAuth 1.0a. The user signs in and grants access on `zotero.org`, not inside ThesisOS.
5. Cloud authorization will request the minimum permissions needed: read access to the personal library and read access to groups. Notes and write access are excluded until a feature explicitly requires them and receives a separate product/security decision.
6. The OAuth result and Zotero user ID will be stored as sensitive credentials using platform-secure storage. Users will be able to disconnect and revoke the connection.
7. Manual `ZOTERO_API_KEY` and `ZOTERO_USER_ID` configuration remains an advanced option for development, automation, and self-hosting, not the normal onboarding flow.
8. Public cloud libraries may be read without authentication where Zotero permits it.

## User flow

1. Try the local Zotero Desktop connection.
2. If successful, show `Connected · local`, discover libraries, and automatically select the sole non-empty library or ask the user to choose among multiple non-empty libraries.
3. If unsuccessful, offer to retry after opening Zotero or enabling local API access.
4. Also offer **Connect Zotero Cloud** when cloud authorization is available.
5. For cloud connection, redirect to Zotero, receive the OAuth callback, verify the returned key and permissions, discover libraries, and continue through the same library-selection interface.

## Consequences

- Local users get a credential-free, private, low-friction connection.
- A purely hosted browser application cannot depend on reaching the user's localhost and therefore uses OAuth.
- ThesisOS must register an OAuth application with Zotero before cloud connection can ship.
- OAuth 1.0a callback state, credential encryption, permission verification, revocation, and token-expiry/revocation errors become required cloud-connection work.
- If Zotero adds OAuth 2.0, migration will require a separate decision and compatibility plan.

## Current implementation

- Implemented: local API detection and read-only access, personal/group discovery, deterministic selection, saved project selection, manual Web API credentials.
- Not implemented: connection UI wired to the connector, OAuth registration and handshake, secure credential storage, cloud disconnect/revocation, credentialed Web API integration testing.

## References

- [Zotero Web API authentication and Local API](https://www.zotero.org/support/dev/web_api/v3/basics#authentication)
- [Zotero OAuth key exchange](https://www.zotero.org/support/dev/web_api/v2/oauth)
