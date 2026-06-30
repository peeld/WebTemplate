#pragma once
#include <string>

// HMAC-SHA256 over msg using key, returns lowercase hex
std::string hmac_sha256_hex(const std::string& key, const std::string& msg);

// SHA-256 of data, returns lowercase hex
std::string sha256_hex(const std::string& data);

// Cryptographically random hex string of `bytes` bytes
std::string random_hex(size_t bytes = 16);
