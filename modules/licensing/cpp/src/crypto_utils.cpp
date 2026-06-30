#include "crypto_utils.h"
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <openssl/rand.h>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <vector>

static std::string to_hex(const unsigned char* data, size_t len) {
    std::ostringstream oss;
    oss << std::hex << std::setfill('0');
    for (size_t i = 0; i < len; ++i)
        oss << std::setw(2) << static_cast<int>(data[i]);
    return oss.str();
}

std::string hmac_sha256_hex(const std::string& key, const std::string& msg) {
    unsigned char digest[EVP_MAX_MD_SIZE];
    unsigned int  digest_len = 0;
    if (!HMAC(EVP_sha256(),
              key.data(),  static_cast<int>(key.size()),
              reinterpret_cast<const unsigned char*>(msg.data()), msg.size(),
              digest, &digest_len)) {
        throw std::runtime_error("HMAC-SHA256 failed");
    }
    return to_hex(digest, digest_len);
}

std::string sha256_hex(const std::string& data) {
    unsigned char digest[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(data.data()), data.size(), digest);
    return to_hex(digest, SHA256_DIGEST_LENGTH);
}

std::string random_hex(size_t bytes) {
    std::vector<unsigned char> buf(bytes);
    if (RAND_bytes(buf.data(), static_cast<int>(bytes)) != 1)
        throw std::runtime_error("RAND_bytes failed");
    return to_hex(buf.data(), bytes);
}
