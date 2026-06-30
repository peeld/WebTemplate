cmake_minimum_required(VERSION 3.20)
project(Licensing VERSION 1.0 LANGUAGES CXX)

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

# ── Static library ─────────────────────────────────────────────────────────
add_library(licensing STATIC
    src/crypto_utils.cpp
    src/machine_id.cpp
    src/license_client.cpp
    src/license_verifier.cpp
)

target_include_directories(licensing PUBLIC src)
target_compile_definitions(licensing PUBLIC CPPHTTPLIB_OPENSSL_SUPPORT)
target_link_libraries(licensing
    PUBLIC
        httplib::httplib
        nlohmann_json::nlohmann_json
        OpenSSL::SSL
        OpenSSL::Crypto
)

if(WIN32)
    target_link_libraries(licensing PUBLIC ws2_32 crypt32)
endif()

if(APPLE)
    target_link_libraries(licensing PUBLIC
        "-framework IOKit"
        "-framework CoreFoundation"
    )
endif()

# ── CLI installer / admin tool ─────────────────────────────────────────────
add_executable(licensing_cli src/main.cpp)
target_link_libraries(licensing_cli PRIVATE licensing)

# ── App simulation / integration test ─────────────────────────────────────
add_executable(app_example src/app_example.cpp)
target_link_libraries(app_example PRIVATE licensing)
