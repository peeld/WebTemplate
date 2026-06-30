# licensing — C++ client library

Offline-capable license verification for C++ applications. Handles machine activation, RS256 JWT-based offline checks, and periodic renewal against the licensing server.

## Overview

After a one-time activation the app holds three values in local storage:

| Value | What it is |
|---|---|
| `product_slug` | Identifies which product this license is for |
| `machine_secret` | HMAC key used to authenticate renewal requests |
| `offline_jwt` | RS256-signed JWT verified locally at every startup |

The license key UUID is discarded after activation and never stored.

---

## Building

### Prerequisites

- CMake ≥ 3.20
- OpenSSL (headers + libraries)
- C++17 compiler

```bash
cmake -S . -B build
cmake --build build
```

CMake fetches `cpp-httplib` and `nlohmann/json` via FetchContent automatically.

### Outputs

| Target | Description |
|---|---|
| `licensing` | Static library — link this into your app |
| `licensing_cli` | Admin CLI: activate, checkin, verify |
| `app_example` | Simulates how an app uses the library |

---

## Generating RSA keys

Do this once per deployment. The server keeps the private key; apps embed the public key.

```bash
# Private key — stays on the server, never distributed
openssl genrsa -out license_private.pem 2048

# Public key — embed in every application binary
openssl rsa -in license_private.pem -pubout -out license_public.pem
```

Set `LICENSE_RSA_PRIVATE_KEY_PATH` in Django settings to the path of `license_private.pem`. The server will raise `ImproperlyConfigured` on startup if this is not set.

---

## Integrating into your app

### 1. Add the library to your CMakeLists.txt

```cmake
add_subdirectory(path/to/licensing/cpp)

target_link_libraries(your_app PRIVATE licensing)
```

The `licensing` target exports its `src/` directory as a public include path, so headers are available as `#include "license_client.h"` etc.

### 2. Embed the public key at build time

```cpp
static const char* PUBLIC_KEY_PEM = R"(
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
)";

LicenseVerifier verifier(PUBLIC_KEY_PEM);
```

Inject the key via the build system rather than editing source directly — e.g. `configure_file` in CMake or a `-D` flag.

---

## Application flow

### First run — activation

Call this once. Persist the returned credentials in encrypted local storage.

```cpp
#include "license_client.h"
#include "license_verifier.h"

// app_secret is baked into the binary at build time (LICENSE_APP_SECRET on the server).
LicenseClient client("https://your-server.com", APP_SECRET);

// Exchange the single-use install token the user entered.
auto tok = client.exchange_install_token(install_token);

// Register this machine. Returns an offline JWT + machine_secret.
auto act = client.activate(tok.license_key);
// The license key UUID is now discarded — never store it.

// Verify the JWT locally before persisting.
LicenseVerifier verifier(PUBLIC_KEY_PEM);
verifier.verify(act.token);

// Persist these three values in encrypted local storage:
//   act.machine_secret
//   tok.product_slug
//   act.token          (offline_jwt)
```

### Every startup — license check

```cpp
#include "license_client.h"
#include "license_verifier.h"
#include "crypto_utils.h"
#include "machine_id.h"

LicenseVerifier verifier(PUBLIC_KEY_PEM);
std::string active_jwt = load_persisted_jwt();

// Renew if the JWT is expiring within 24 hours (or has already expired).
// expiring_soon() does not verify the signature — it just peeks at exp.
if (verifier.expiring_soon(active_jwt, 86400)) {
    LicenseClient client("https://your-server.com");
    auto renewed = client.machine_checkin(product_slug, machine_secret);
    active_jwt = renewed.token;
    persist_jwt(active_jwt);
}

// Full verification: RS256 signature, expiry, and claims.
VerifyResult vr = verifier.verify(active_jwt);  // throws on failure

// Confirm this JWT belongs to the current machine.
if (vr.machine != sha256_hex(get_raw_machine_id()))
    throw std::runtime_error("Machine binding mismatch");

// vr.product, vr.machine, vr.exp are now trusted.
```

### Handling offline operation

`verify()` is entirely local — it requires no network. As long as the JWT has not expired the app works without connectivity. The JWT TTL is controlled by `offline_ttl_days` on the server (default 30 days). Design your renewal window to be large enough that normal use always catches the renewal opportunity before expiry.

---

## API reference

### `LicenseClient`

```cpp
LicenseClient(std::string base_url, std::string app_secret = "");
```

| Method | Description |
|---|---|
| `exchange_install_token(token)` | Exchange a single-use install token for a license key UUID |
| `activate(license_key, label)` | Register this machine; returns `ActivateResult` with `token`, `machine_secret`, `expires_at` |
| `machine_checkin(product_slug, machine_secret)` | Renew the offline JWT; returns `CheckinResult` with `token`, `expires_at` |
| `checkin(license_key)` | Legacy renewal using the license key UUID and `app_secret` |
| `machine_id_hash()` | SHA-256 of this machine's hardware identifier |

### `LicenseVerifier`

```cpp
LicenseVerifier(std::string public_key_pem);
```

| Method | Description |
|---|---|
| `verify(jwt)` | Verify RS256 signature, expiry, and claims. Throws `std::runtime_error` on any failure. Returns `VerifyResult`. |
| `expiring_soon(jwt, within_seconds)` | Returns `true` if the JWT expires within `within_seconds` (default 86400). Does not check the signature. Returns `true` if the JWT cannot be parsed. |

### `VerifyResult`

```cpp
struct VerifyResult {
    std::string license;  // license UUID
    std::string machine;  // SHA-256 of machine hardware ID
    std::string product;  // product slug
    long long   exp;      // expiry as unix timestamp
};
```

### `machine_id.h`

```cpp
std::string get_raw_machine_id();  // platform-specific hardware identifier
```

Platform sources: Windows registry `MachineGuid`, macOS `IOPlatformSerialNumber`, Linux `/etc/machine-id`.

### `crypto_utils.h`

```cpp
std::string sha256_hex(const std::string& data);
std::string hmac_sha256_hex(const std::string& key, const std::string& msg);
std::string random_hex(size_t bytes = 16);
```

---

## CLI tools

### `licensing_cli` — admin / installer

```bash
# Activate a machine (first install)
licensing_cli activate \
  --url https://your-server.com \
  --install-token <token> \
  --app-secret <secret> \
  --label "Alice's Workstation"

# Renew the offline JWT
licensing_cli checkin \
  --url https://your-server.com \
  --product-slug my-app \
  --machine-secret <secret>

# Verify a JWT locally without a network call
licensing_cli verify \
  --offline-jwt <jwt> \
  --public-key /path/to/license_public.pem
```

### `app_example` — integration test / simulation

Simulates a real licensed application. The server URL, product slug, app secret, and public key are hardcoded constants inside the binary. The only user-facing input is the install token on first run.

```bash
# First run — prompts for install token, activates, persists credentials
app_example
# > Enter your install token: <token>

# Subsequent runs — verifies JWT, renews silently if expiring, then runs
app_example

# Clear stored credentials to simulate a fresh install (dev/testing only)
app_example --reset
```

Edit the constants at the top of `src/app_example.cpp` before building:

```cpp
static const char* SERVER_URL     = "https://your-server.com";
static const char* PRODUCT_SLUG   = "my-app";
static const char* APP_SECRET     = "REPLACE_WITH_LICENSE_APP_SECRET";
static const char* PUBLIC_KEY_PEM = R"(
-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----
)";
```
