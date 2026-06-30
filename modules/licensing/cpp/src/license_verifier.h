#pragma once
#include <string>

struct VerifyResult {
    std::string license;  // license UUID from JWT
    std::string machine;  // machine_id_hash from JWT
    std::string product;  // product slug from JWT
    long long   exp = 0;  // expiry as unix timestamp
};

// Verifies an RS256 offline JWT issued by the licensing server.
// Construct with the RSA public key PEM embedded in the application binary.
class LicenseVerifier {
public:
    explicit LicenseVerifier(std::string public_key_pem);

    // Verify the JWT: RS256 signature, expiry, and required claims.
    // Throws std::runtime_error if any check fails.
    VerifyResult verify(const std::string& jwt) const;

    // Returns true if the JWT expires within `within_seconds` from now,
    // or if the JWT cannot be parsed at all. Does NOT check the signature —
    // call this to decide whether to proactively renew before calling verify().
    bool expiring_soon(const std::string& jwt, int within_seconds = 86400) const;

private:
    std::string public_key_pem_;
};
