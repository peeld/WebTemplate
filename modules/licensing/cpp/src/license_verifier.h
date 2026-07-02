#pragma once
#include <string>
#include <vector>

struct VerifyResult {
    std::string license;  // license UUID from JWT
    std::string machine;  // machine_id_hash from JWT
    std::string product;  // product slug from JWT
    std::vector< std::string > mac; // mac addresses from JWT
    long long   exp = 0;  // expiry as unix timestamp

    // Seconds our effective clock is behind the server's iat timestamp.
    // Zero means no detectable skew (or no iat in token).
    // Positive means the client clock appears slow / was rolled back.
    long long   clock_skew_seconds = 0;
};

// Verifies an RS256 offline JWT issued by the licensing server.
// Construct with the RSA public key PEM embedded in the application binary
// and an optional path for the anti-rollback checkpoint file.
class LicenseVerifier {
public:
    explicit LicenseVerifier(std::string public_key_pem,
                             std::string checkpoint_path = "");

    // Verify the JWT: RS256 signature, expiry, and required claims.
    // Time is cross-checked against filesystem timestamps and the anti-rollback
    // checkpoint; the checkpoint is updated on each successful call.
    // Throws std::runtime_error if any check fails.
    VerifyResult verify(const std::string& jwt) const;

    // Returns true if the JWT expires within `within_seconds` from now,
    // or if the JWT cannot be parsed. Does NOT check the signature.
    bool expiring_soon(const std::string& jwt, int within_seconds = 86400) const;

private:
    std::string public_key_pem_;
    std::string checkpoint_path_;
};
