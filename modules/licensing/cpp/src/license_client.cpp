#include "license_client.h"
#include "crypto_utils.h"
#include "machine_id.h"

#define CPPHTTPLIB_OPENSSL_SUPPORT
#include <httplib.h>
#include <nlohmann/json.hpp>

#include <chrono>
#include <stdexcept>
#include <string>

using json = nlohmann::json;

namespace {

std::string now_timestamp() {
    return std::to_string(
        std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count());
}

// Legacy HMAC headers: signed with app_secret, includes license key UUID
// message = license_key + timestamp + nonce + machine_id_hash
httplib::Headers legacy_signed_headers(const std::string& license_key,
                                       const std::string& app_secret,
                                       const std::string& machine_id_hash)
{
    std::string ts    = now_timestamp();
    std::string nonce = random_hex(16);
    std::string msg   = license_key + ts + nonce + machine_id_hash;
    std::string sig   = hmac_sha256_hex(app_secret, msg);
    return {
        {"X-License-Key", license_key},
        {"X-Machine-ID",  machine_id_hash},
        {"X-Timestamp",   ts},
        {"X-Nonce",       nonce},
        {"X-Signature",   sig},
        {"Content-Type",  "application/json"},
    };
}

// Machine-secret HMAC headers: signed with machine_secret, no license UUID
// message = machine_id_hash + product_slug + timestamp + nonce
httplib::Headers machine_secret_headers(const std::string& machine_id_hash,
                                        const std::string& product_slug,
                                        const std::string& machine_secret)
{
    std::string ts    = now_timestamp();
    std::string nonce = random_hex(16);
    std::string msg   = machine_id_hash + product_slug + ts + nonce;
    std::string sig   = hmac_sha256_hex(machine_secret, msg);
    return {
        {"X-Machine-ID",   machine_id_hash},
        {"X-Product-Slug", product_slug},
        {"X-Timestamp",    ts},
        {"X-Nonce",        nonce},
        {"X-Signature",    sig},
        {"Content-Type",   "application/json"},
    };
}

// Trial-request HMAC headers: signed with app_secret.
// message = product_slug + email + machine_id_hash + timestamp + nonce
httplib::Headers trial_request_headers(const std::string& product_slug,
                                       const std::string& email,
                                       const std::string& app_secret,
                                       const std::string& machine_id_hash,
                                       std::string& out_ts,
                                       std::string& out_nonce)
{
    out_ts    = now_timestamp();
    out_nonce = random_hex(16);
    std::string msg = product_slug + email + machine_id_hash + out_ts + out_nonce;
    std::string sig = hmac_sha256_hex(app_secret, msg);
    return {
        {"X-Machine-ID", machine_id_hash},
        {"X-Timestamp",  out_ts},
        {"X-Nonce",      out_nonce},
        {"X-Signature",  sig},
        {"Content-Type", "application/json"},
    };
}

void check_response(const httplib::Result& res, const char* endpoint) {
    if (!res)
        throw std::runtime_error(std::string(endpoint) + " request failed: "
                                 + httplib::to_string(res.error()));
    if (res->status != 200)
        throw std::runtime_error(std::string(endpoint) + " returned HTTP "
                                 + std::to_string(res->status) + ": " + res->body);
}

} // namespace

LicenseClient::LicenseClient(std::string base_url, std::string app_secret)
    : base_url_(std::move(base_url)), app_secret_(std::move(app_secret))
{
    machine_id_hash_ = sha256_hex(get_raw_machine_id());
}

InstallTokenResult LicenseClient::exchange_install_token(const std::string& install_token) {
    json body = {{"token", install_token}};

    httplib::Client cli(base_url_);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(30);
    auto res = cli.Post("/api/licensing/install-token/exchange/",
                        {{"Content-Type", "application/json"}},
                        body.dump(), "application/json");
    check_response(res, "/license/install-token/exchange/");

    auto j = json::parse(res->body);
    return InstallTokenResult{
        j.at("license_key").get<std::string>(),
        j.at("product_slug").get<std::string>(),
        j.at("product_name").get<std::string>(),
    };
}

ActivateResult LicenseClient::activate(const std::string& license_key,
                                        const std::string& machine_label)
{
    if (app_secret_.empty())
        throw std::runtime_error("activate() requires app_secret");

    auto hdrs = legacy_signed_headers(license_key, app_secret_, machine_id_hash_);
    json body = {{"machine_label", machine_label}};

    httplib::Client cli(base_url_);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(30);
    auto res = cli.Post("/api/licensing/activate/", hdrs, body.dump(), "application/json");
    check_response(res, "/license/activate/");

    auto j = json::parse(res->body);
    return ActivateResult{
        j.at("token").get<std::string>(),
        j.at("expires_at").get<std::string>(),
        j.at("machine_secret").get<std::string>(),
        j.at("machines_used").get<int>(),
        j.at("max_machines").get<int>(),
    };
}

CheckinResult LicenseClient::machine_checkin(const std::string& product_slug,
                                              const std::string& machine_secret)
{
    auto hdrs = machine_secret_headers(machine_id_hash_, product_slug, machine_secret);

    httplib::Client cli(base_url_);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(30);
    auto res = cli.Post("/api/licensing/machine-checkin/", hdrs, "{}", "application/json");
    check_response(res, "/license/machine-checkin/");

    auto j = json::parse(res->body);
    return CheckinResult{
        j.at("token").get<std::string>(),
        j.at("expires_at").get<std::string>(),
    };
}

CheckinResult LicenseClient::checkin(const std::string& license_key) {
    if (app_secret_.empty())
        throw std::runtime_error("legacy checkin() requires app_secret");

    auto hdrs = legacy_signed_headers(license_key, app_secret_, machine_id_hash_);

    httplib::Client cli(base_url_);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(30);
    auto res = cli.Post("/api/licensing/checkin/", hdrs, "{}", "application/json");
    check_response(res, "/license/checkin/");

    auto j = json::parse(res->body);
    return CheckinResult{
        j.at("token").get<std::string>(),
        j.at("expires_at").get<std::string>(),
    };
}

void LicenseClient::request_trial(const std::string& product_slug, const std::string& email) {
    if (app_secret_.empty())
        throw std::runtime_error("request_trial() requires app_secret");

    std::string ts, nonce;
    auto hdrs = trial_request_headers(product_slug, email, app_secret_, machine_id_hash_, ts, nonce);
    json body = {{"product_slug", product_slug}, {"email", email}};

    httplib::Client cli(base_url_);
    cli.set_connection_timeout(10);
    cli.set_read_timeout(30);
    auto res = cli.Post("/api/licensing/trial/request/", hdrs, body.dump(), "application/json");

    if (!res)
        throw std::runtime_error(std::string("/license/trial/request/ request failed: ") + httplib::to_string(res.error()));
    if (res->status != 202)
        throw std::runtime_error("/license/trial/request/ returned HTTP " + std::to_string(res->status) + ": " + res->body);
}

std::string LicenseClient::build_offline_trial_payload(const std::string& product_slug,
                                                        const std::string& email) const
{
    if (app_secret_.empty())
        throw std::runtime_error("build_offline_trial_payload() requires app_secret");

    std::string ts, nonce;
    auto hdrs = trial_request_headers(product_slug, email, app_secret_, machine_id_hash_, ts, nonce);
    (void)hdrs; // headers aren't needed here — only the ts/nonce/sig used to build the URL below

    std::string msg = product_slug + email + machine_id_hash_ + ts + nonce;
    std::string sig = hmac_sha256_hex(app_secret_, msg);

    // The public /trial-claim frontend page reads these query params and POSTs
    // them to /api/licensing/trial/request/ — same endpoint request_trial() calls
    // directly when online. Caller is responsible for percent-encoding `email`
    // if it may contain characters unsafe for a URL (e.g. '+').
    return base_url_ + "/trial-claim"
         + "?product=" + product_slug
         + "&email="   + email
         + "&mid="     + machine_id_hash_
         + "&ts="      + ts
         + "&nonce="   + nonce
         + "&sig="     + sig;
}
