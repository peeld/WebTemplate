// Example of how a licensed C++ application embeds the licensing library.
//
// Build-time constants (SERVER_URL, APP_SECRET, PUBLIC_KEY_PEM) are baked in.
// The only user-facing input is the install token on first run.
//
// Launch behaviour:
//   - No credentials stored  →  prompt for install token, activate, save
//   - Credentials exist      →  verify JWT, renew silently if expiring soon
//
// Developer flag: --reset   clears stored credentials (simulates a fresh install)

#include "license_client.h"
#include "license_verifier.h"
#include "crypto_utils.h"
#include "machine_id.h"

#include <nlohmann/json.hpp>

#include <chrono>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>

using json = nlohmann::json;

// ── Build-time configuration ──────────────────────────────────────────────
// In production these are injected by the build system (e.g. via -D flags or
// a generated config header), never edited by hand in source.

static const char* SERVER_URL   = "http://localhost:5173";
static const char* PRODUCT_SLUG = "testproduct";
static const char* APP_SECRET   = "WhatIsAGoodSecret?";

// Embed the full RSA public key PEM here at build time.
// Generate: openssl rsa -in license_private.pem -pubout -out license_public.pem
static const char* PUBLIC_KEY_PEM = R"(
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApsURHD4ypThYdjBczpGb
BfZ1AdbGU6JxCcX3NaiovfuHHl5BL1O5gPbXaf7GcjtAYOtK+CVk8Osp4oa8n71h
ukxiCDmoOjkFncbh9fQ0afX+kK6lNG/EIaWKKvGD7xuHb7d8tnCCjlPCJNxzxsvk
Sc2BXF6xC45GWINBYMcGTkXfqJ6Rr4TGyjgitLRjnFyXR/YY7O2T683nVn7wH4nh
NBf/b1L5Lxu5GP0G5xQoBya+rKlZCw+E2D0YDdEpr1ZAa/WoS9aAUEJyZE7kVtGG
3k8SaR6UyH4xN6E3L49PZMagJ1kutxqWjzdm7BmSqNi8R/vT4e9XzMSpnkloXR38
7QIDAQAB
-----END PUBLIC KEY-----

)";

// Where credentials are persisted between runs.
// In a real app use the OS app-data directory and encrypt the contents.
static const char* CREDS_FILE = ".license";

// ── Credential storage ────────────────────────────────────────────────────

struct Credentials {
    std::string machine_secret;
    std::string product_slug;
    std::string offline_jwt;
};

static bool load_credentials(Credentials& out) {
    std::ifstream f(CREDS_FILE);
    if (!f) return false;
    try {
        auto j = json::parse(f);
        out.machine_secret = j.at("machine_secret").get<std::string>();
        out.product_slug   = j.at("product_slug").get<std::string>();
        out.offline_jwt    = j.at("offline_jwt").get<std::string>();
        return true;
    } catch (...) {
        return false;
    }
}

static void save_credentials(const Credentials& c) {
    std::ofstream f(CREDS_FILE);
    if (!f) throw std::runtime_error(std::string("Cannot write credentials: ") + CREDS_FILE);
    f << json({
        {"machine_secret", c.machine_secret},
        {"product_slug",   c.product_slug},
        {"offline_jwt",    c.offline_jwt},
    }).dump(2);
}

// ── Helpers ───────────────────────────────────────────────────────────────

static LicenseVerifier make_verifier() {
    return LicenseVerifier(PUBLIC_KEY_PEM);
}

// ── First-run activation ──────────────────────────────────────────────────

static Credentials activate() {
    std::cout << "No license found.\n\n"
              << "Enter your install token: ";
    std::string token;
    if (!std::getline(std::cin, token) || token.empty())
        throw std::runtime_error("No token entered");

    std::cout << "\nActivating...\n";

    LicenseClient client(SERVER_URL, APP_SECRET);
    auto tok = client.exchange_install_token(token);
    auto act = client.activate(tok.license_key);

    // Verify the JWT before persisting - confirms the server issued it correctly.
    make_verifier().verify(act.token);

    Credentials c{ act.machine_secret, tok.product_slug, act.token };
    save_credentials(c);

    std::cout << "Activated successfully. License expires: " << act.expires_at << "\n\n";
    return c;
}

// ── Per-launch license check ──────────────────────────────────────────────

static VerifyResult check_license(Credentials& creds) {
    auto verifier = make_verifier();

    // Renew silently if the JWT expires within 24 hours.
    if (verifier.expiring_soon(creds.offline_jwt, 86400)) {
        try {
            LicenseClient client(SERVER_URL);
            auto renewed = client.machine_checkin(creds.product_slug, creds.machine_secret);
            creds.offline_jwt = renewed.token;
            save_credentials(creds);
        } catch (const std::exception& e) {
            // Network unavailable - fall through. verify() will still accept
            // the existing JWT if it hasn't actually expired yet.
            std::cerr << "Note: license renewal failed (" << e.what() << "). Using cached JWT.\n";
        }
    }

    // Full check: signature, expiry, and machine binding.
    auto vr = verifier.verify(creds.offline_jwt);

    if (vr.machine != sha256_hex(get_raw_machine_id()))
        throw std::runtime_error("License is bound to a different machine");

    if (vr.product != std::string(PRODUCT_SLUG))
        throw std::runtime_error("License product does not match this application");

    return vr;
}

// ── Entry point ───────────────────────────────────────────────────────────

int main(int argc, char** argv) {
    // --reset simulates a fresh install (clears stored credentials).
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--reset") == 0) {
            std::remove(CREDS_FILE);
            std::cout << "License credentials cleared.\n";
            return 0;
        }
    }

    try {
        Credentials creds;
        if (!load_credentials(creds))
            creds = activate();

        auto vr = check_license(creds);

        long long now = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        std::cout << "License valid - " << vr.product
                  << " (expires in " << (vr.exp - now) / 86400 << " day(s))\n\n";

        // ── Application starts here ────────────────────────────────────────
        std::cout << "Hello from the licensed application!\n";

    } catch (const std::exception& e) {
        std::cerr << "License error: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
