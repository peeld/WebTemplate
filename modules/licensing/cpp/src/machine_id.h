#pragma once
#include <string>
#include <vector>

// Platform-specific stable machine identifier (raw, before hashing)
bool get_raw_machine_id(std::string& id, std::vector<std::string >& mac);