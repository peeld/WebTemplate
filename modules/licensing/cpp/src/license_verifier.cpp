#include "license_verifier.h"

#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/pem.h>

#include <nlohmann/json.hpp>

#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>

using json = nlohmann::json;

namespace {

// Convert base64url (no padding) to raw bytes.
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

struct JwtParts {
    std::string       header_b64;
    std::string       payload_b64;
    std::string       signed_data;   // "header_b64.payload_b64" — what was signed
    std::vector<uint8_t> sig_bytes;
    json              payload;
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

// Peek at the exp claim without verifying the signature. Returns 0 on error.
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


VerifyResult extract_claims(const json& payload) {
    VerifyResult r;
    try {
        r.license = payload.at("license").get<std::string>();
        r.machine = payload.at("machine").get<std::string>();
        r.product = payload.at("product").get<std::string>();
        r.exp     = payload.at("exp").get<long long>();
    } catch (const json::exception& e) {
        throw std::runtime_error(std::string("JWT missing required claim: ") + e.what());
    }

    long long now = std::chrono::duration_cast<std::chrono::seconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    if (r.exp <= now)
        throw std::runtime_error("JWT has expired");
    return r;
}

} // namespace

LicenseVerifier::LicenseVerifier(std::string public_key_pem)
    : public_key_pem_(std::move(public_key_pem))
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

    return extract_claims(p.payload);
}

bool LicenseVerifier::expiring_soon(const std::string& token, int within_seconds) const {
    try {
        long long exp = peek_exp(token);
        long long now = std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
        return (exp - now) <= static_cast<long long>(within_seconds);
    } catch (...) {
        return true;
    }
}
