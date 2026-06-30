#pragma once
#include <string>

struct InstallTokenResult {
    std::string license_key;
    std::string product_slug;
    std::string product_name;
};

struct ActivateResult {
    std::string token;
    std::string expires_at;
    std::string machine_secret;
    int         machines_used = 0;
    int         max_machines  = 0;
};

struct CheckinResult {
    std::string token;
    std::string expires_at;
};

class LicenseClient {
public:
    // base_url:   scheme + host, e.g. "https://example.com" or "http://localhost:8000"
    // app_secret: LICENSE_APP_SECRET — required for activate() and legacy checkin();
    //             leave empty if only using machine_checkin()
    LicenseClient(std::string base_url, std::string app_secret = "");

    // Exchange a single-use install token for a license key UUID (step 3 of install flow)
    InstallTokenResult exchange_install_token(const std::string& install_token);

    // Register this machine; returns offline JWT and machine_secret (step 4 of install flow)
    // After calling this, store machine_secret + machine_id_hash() + product_slug and discard license_key
    ActivateResult activate(const std::string& license_key,
                            const std::string& machine_label = "");

    // Renew offline JWT using machine_secret — preferred; no license UUID needed
    CheckinResult machine_checkin(const std::string& product_slug,
                                  const std::string& machine_secret);

    // Renew offline JWT using license key UUID (legacy — still supported)
    CheckinResult checkin(const std::string& license_key);

    // SHA-256 hex of this machine's raw ID — store alongside machine_secret after activation
    const std::string& machine_id_hash() const { return machine_id_hash_; }

private:
    std::string base_url_;
    std::string app_secret_;
    std::string machine_id_hash_;
};
