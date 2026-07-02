#include "license_verifier.h"

#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/pem.h>

#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;
namespace fs = std::filesystem;

namespace {

// -- Base64url ----------------------------------------------------------------

std::vector<uint8_t> b64url_decode(std::string s) {
    for (auto& c : s) {
        if (c == '-') c = '+';
        if (c == '_') c = '/';
    }
    while (s.size() % 4) s += '=';

    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    BIO* mem = BIO_new_mem_buf(s.data(), static_cast<int>(s.size()));
    BIO_push(b64, mem);

    std::vector<uint8_t> out(s.size());
    int len = BIO_read(b64, out.data(), static_cast<int>(out.size()));
    BIO_free_all(b64);
    if (len < 0) throw std::runtime_error("base64url decode failed");
    out.resize(static_cast<size_t>(len));
    return out;
}

// -- JWT parsing --------------------------------------------------------------

struct JwtParts {
    std::string      header_b64;
    std::string      payload_b64;
    std::string      signed_data;
    std::vector<uint8_t> sig_bytes;
    json             payload;
};

JwtParts parse_jwt(const std::string& token) {
    auto d1 = token.find('.');
    if (d1 == std::string::npos)
        throw std::runtime_error("Malformed JWT: missing first '.'");
    auto d2 = token.find('.', d1 + 1);
    if (d2 == std::string::npos)
        throw std::runtime_error("Malformed JWT: missing second '.'");

    JwtParts p;
    p.header_b64  = token.substr(0, d1);
    p.payload_b64 = token.substr(d1 + 1, d2 - d1 - 1);
    p.signed_data = token.substr(0, d2);
    p.sig_bytes   = b64url_decode(token.substr(d2 + 1));

    auto payload_bytes = b64url_decode(p.payload_b64);
    p.payload = json::parse(payload_bytes.begin(), payload_bytes.end());
    return p;
}

long long peek_exp(const std::string& token) {
    auto d1 = token.find('.');
    auto d2 = (d1 != std::string::npos) ? token.find('.', d1 + 1) : std::string::npos;
    if (d1 == std::string::npos || d2 == std::string::npos) return 0;
    auto payload_bytes = b64url_decode(token.substr(d1 + 1, d2 - d1 - 1));
    auto payload = json::parse(payload_bytes.begin(), payload_bytes.end());
    return payload.value("exp", 0LL);
}

void check_rs256(const JwtParts& p, const std::string& pem) {
    BIO* bio = BIO_new_mem_buf(pem.data(), static_cast<int>(pem.size()));
    EVP_PKEY* pkey = PEM_read_bio_PUBKEY(bio, nullptr, nullptr, nullptr);
    BIO_free(bio);
    if (!pkey)
        throw std::runtime_error("Failed to load RSA public key from PEM");

    EVP_MD_CTX* ctx = EVP_MD_CTX_new();
    if (!ctx) { EVP_PKEY_free(pkey); throw std::runtime_error("EVP_MD_CTX_new failed"); }

    bool ok = (
        EVP_DigestVerifyInit(ctx, nullptr, EVP_sha256(), nullptr, pkey) == 1 &&
        EVP_DigestVerifyUpdate(ctx,
            reinterpret_cast<const uint8_t*>(p.signed_data.data()),
            p.signed_data.size()) == 1 &&
        EVP_DigestVerifyFinal(ctx, p.sig_bytes.data(), p.sig_bytes.size()) == 1
    );

    EVP_MD_CTX_free(ctx);
    EVP_PKEY_free(pkey);

    if (!ok)
        throw std::runtime_error("RS256 signature verification failed");
}

// -- Time cross-checking ------------------------------------------------------

// C++17: convert file_time_type to unix seconds via a system_clock delta.
// (clock_cast is C++20; this approach snapshots both clocks and applies the offset.)
long long file_time_to_unix(fs::file_time_type ft) {
    using namespace std::chrono;
    auto file_now = fs::file_time_type::clock::now();
    auto sys_now  = system_clock::now();
    auto delta    = ft - file_now;
    auto as_sys   = sys_now + duration_cast<system_clock::duration>(delta);
    return duration_cast<seconds>(as_sys.time_since_epoch()).count();
}

// Scan user-accessible directories for the most recent file mtime.
// Tries several environment variables; ignores any directory it can't open.
// Throws if no files were found at all across every candidate directory.
long long max_file_timestamp() {
    static const char* const env_dirs[] = {
        "TEMP", "TMP", "TMPDIR",          // temp (all platforms)
        "APPDATA", "LOCALAPPDATA",        // Windows user profile
        "HOME", "USERPROFILE",            // home dir
        nullptr
    };

    long long best    = 0;
    bool      any     = false;

    for (int i = 0; env_dirs[i]; ++i) {
        const char* dir = std::getenv(env_dirs[i]);
        if (!dir) continue;

        try {
            for (const auto& entry : fs::directory_iterator(
                     dir, fs::directory_options::skip_permission_denied)) {
                try {
                    long long t = file_time_to_unix(entry.last_write_time());
                    any = true;
                    if (t > best) best = t;
                } catch (...) {}
            }
        } catch (...) {}
    }

    if (!any)
        throw std::runtime_error(
            "Clock verification failed: no accessible files found for timestamp cross-check");

    return best;
}

// -- Anti-rollback checkpoint -------------------------------------------------

// XOR mask so the stored bytes don't look like a raw unix timestamp.
constexpr uint64_t CHECKPOINT_MASK = 0xA3C5E7F192B4D608ULL;

long long read_checkpoint(const std::string& path) {
    if (path.empty()) return 0;
    try {
        std::ifstream f(path, std::ios::binary);
        if (!f) return 0;
        uint64_t raw = 0;
        f.read(reinterpret_cast<char*>(&raw), sizeof(raw));
        if (static_cast<size_t>(f.gcount()) != sizeof(raw)) return 0;
        return static_cast<long long>(raw ^ CHECKPOINT_MASK);
    } catch (...) {
        return 0;
    }
}

void write_checkpoint(const std::string& path, long long t) {
    if (path.empty()) return;
    try {
        std::ofstream f(path, std::ios::binary | std::ios::trunc);
        if (!f) return;
        uint64_t raw = static_cast<uint64_t>(t) ^ CHECKPOINT_MASK;
        f.write(reinterpret_cast<const char*>(&raw), sizeof(raw));
    } catch (...) {}
}

// Returns the effective current time: the maximum of the system clock,
// the most recent file mtime found in accessible directories, and any
// stored anti-rollback checkpoint.  Throws if the file scan finds nothing.
long long effective_now(const std::string& checkpoint_path) {
    using namespace std::chrono;
    long long sys = duration_cast<seconds>(
        system_clock::now().time_since_epoch()).count();
    long long file_max   = max_file_timestamp();   // throws if no files
    long long checkpoint = read_checkpoint(checkpoint_path);
    return std::max({sys, file_max, checkpoint});
}

// -- Claims extraction --------------------------------------------------------

VerifyResult extract_claims(const json& payload, long long now) {
    VerifyResult r;
    try {
        r.license = payload.at("license").get<std::string>();
        r.machine = payload.at("machine").get<std::string>();
        r.product = payload.at("product").get<std::string>();
        r.exp     = payload.at("exp").get<long long>();
        r.mac     = payload.at("mac").get<std::vector < std::string > >();
    } catch (const json::exception& e) {
        throw std::runtime_error(std::string("JWT missing required claim: ") + e.what());
    }

    // iat is the server's clock when the license was issued.
    // If our effective time is significantly before that, the local clock is wrong.
    if (payload.contains("iat")) {
        long long iat = payload["iat"].get<long long>();
        long long skew = iat - now;   // positive = we appear to be behind the server
        if (skew > 300)               // more than 5 minutes behind server issue time
            throw std::runtime_error(
                "System clock appears to predate license issuance — "
                "please check your clock settings");
        if (skew > 0)
            r.clock_skew_seconds = skew;
    }

    if (r.exp <= now)
        throw std::runtime_error("License has expired");

    return r;
}

} // namespace

// -- LicenseVerifier ----------------------------------------------------------

LicenseVerifier::LicenseVerifier(std::string public_key_pem,
                                 std::string checkpoint_path)
    : public_key_pem_(std::move(public_key_pem))
    , checkpoint_path_(std::move(checkpoint_path))
{}

VerifyResult LicenseVerifier::verify(const std::string& token) const {
    auto p = parse_jwt(token);

    auto hdr_bytes = b64url_decode(p.header_b64);
    auto header    = json::parse(hdr_bytes.begin(), hdr_bytes.end());
    std::string alg = header.value("alg", "");

    if (alg != "RS256")
        throw std::runtime_error("Unsupported JWT algorithm: " + alg + " (RS256 required)");
    if (public_key_pem_.empty())
        throw std::runtime_error("No RSA public key configured");

    check_rs256(p, public_key_pem_);

    long long now = effective_now(checkpoint_path_);
    VerifyResult result = extract_claims(p.payload, now);

    // Advance the checkpoint so the clock can't be rolled back past this point.
    write_checkpoint(checkpoint_path_, now);

    return result;
}

bool LicenseVerifier::expiring_soon(const std::string& token, int within_seconds) const {
    try {
        long long exp = peek_exp(token);
        long long now;
        try {
            now = effective_now(checkpoint_path_);
        } catch (...) {
            // File scan failed; fall back to system clock for this advisory check.
            using namespace std::chrono;
            now = duration_cast<seconds>(
                system_clock::now().time_since_epoch()).count();
        }
        return (exp - now) <= static_cast<long long>(within_seconds);
    } catch (...) {
        return true;
    }
}
