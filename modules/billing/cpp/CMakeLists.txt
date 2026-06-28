cmake_minimum_required(VERSION 3.20)
project(LicenseTester VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenSSL REQUIRED)

include(FetchContent)

FetchContent_Declare(
    httplib
    GIT_REPOSITORY https://github.com/yhirose/cpp-httplib.git
    GIT_TAG        v0.18.5
)
FetchContent_Declare(
    nlohmann_json
    GIT_REPOSITORY https://github.com/nlohmann/json.git
    GIT_TAG        v3.11.3
)
FetchContent_MakeAvailable(httplib nlohmann_json)

add_executable(license_tester
    src/main.cpp
    src/license_client.cpp
    src/machine_id.cpp
    src/crypto_utils.cpp
)

target_include_directories(license_tester PRIVATE src)

# Enable HTTPS in httplib
target_compile_definitions(license_tester PRIVATE CPPHTTPLIB_OPENSSL_SUPPORT)

target_link_libraries(license_tester
    PRIVATE
        httplib::httplib
        nlohmann_json::nlohmann_json
        OpenSSL::SSL
        OpenSSL::Crypto
)

if(WIN32)
    target_link_libraries(license_tester PRIVATE ws2_32 crypt32)
endif()

if(APPLE)
    target_link_libraries(license_tester PRIVATE "-framework IOKit" "-framework CoreFoundation")
endif()
