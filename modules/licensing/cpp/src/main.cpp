#include "license_client.h"
#include "license_verifier.h"

#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

static void print_usage(const char* prog) {
    std::cerr
        << "Usage: " << prog << " <command> [options]\n\n"
        << "Commands:\n"
        << "  activate   Exchange an install token and register this machine\n"
        << "  checkin    Renew the offline license token\n"
        << "  verify     Verify an offline JWT locally (no network)\n\n"
        << "activate options:\n"
        << "  --url            Server base URL  (e.g. https://example.com)\n"
        << "  --install-token  Single-use install token from the billing portal\n"
        << "  --app-secret     LICENSE_APP_SECRET value (baked into production builds)\n"
        << "  --label          Human-readable machine label (optional)\n\n"
        << "checkin options (machine-secret flow - preferred):\n"
        << "  --url            Server base URL\n"
        << "  --product-slug   Product slug (e.g. my-app)\n"
        << "  --machine-secret Machine secret obtained at activation\n\n"
        << "checkin options (legacy flow):\n"
        << "  --url            Server base URL\n"
        << "  --license-key    License key UUID\n"
        << "  --app-secret     LICENSE_APP_SECRET value\n\n"
        << "verify options:\n"
        << "  --offline-jwt    JWT string to verify\n"
        << "  --public-key     Path to RSA public key PEM\n"
        << "  --checkpoint     Path to anti-rollback checkpoint file (optional)\n";
}

static std::string get_arg(int argc, char** argv, const char* flag,
                            const char* default_val = "") {
    for (int i = 1; i + 1 < argc; ++i)
        if (std::strcmp(argv[i], flag) == 0)
            return argv[i + 1];
    return default_val;
}

static std::string read_file(const std::string& path) {
    std::ifstream f(path);
    if (!f) throw std::runtime_error("Cannot open file: " + path);
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

int main(int argc, char** argv) {
    if (argc < 2) { print_usage(argv[0]); return 1; }

    std::string cmd            = argv[1];
    std::string url            = get_arg(argc, argv, "--url");
    std::string install_token  = get_arg(argc, argv, "--install-token");
    std::string app_secret     = get_arg(argc, argv, "--app-secret");
    std::string label          = get_arg(argc, argv, "--label");
    std::string license_key    = get_arg(argc, argv, "--license-key");
    std::string product_slug   = get_arg(argc, argv, "--product-slug");
    std::string machine_secret = get_arg(argc, argv, "--machine-secret");
    std::string offline_jwt    = get_arg(argc, argv, "--offline-jwt");
    std::string public_key     = get_arg(argc, argv, "--public-key");
    std::string checkpoint     = get_arg(argc, argv, "--checkpoint");

    if (url.empty() && cmd != "verify") {
        std::cerr << "Error: --url is required.\n\n";
        print_usage(argv[0]);
        return 1;
    }

    try {
        if (cmd == "activate") {
            if (install_token.empty() || app_secret.empty()) {
                std::cerr << "Error: activate requires --install-token and --app-secret.\n\n";
                print_usage(argv[0]);
                return 1;
            }

            LicenseClient client(url, app_secret);
            std::cout << "Machine ID hash: " << client.machine_id_hash() << "\n\n";

            std::cout << "Exchanging install token...\n";
            auto tok = client.exchange_install_token(install_token);
            std::cout << "  Product: " << tok.product_name
                      << " (" << tok.product_slug << ")\n\n";

            std::cout << "Activating machine...\n";
            auto r = client.activate(tok.license_key, label);
            std::cout << "Activated successfully.\n"
                      << "  Expires at:     " << r.expires_at      << "\n"
                      << "  Machines used:  " << r.machines_used
                      << " / "                << r.max_machines    << "\n\n"
                      << "Store these values securely - the license key is now discarded:\n"
                      << "  machine_secret: " << r.machine_secret  << "\n"
                      << "  machine_id_hash:" << client.machine_id_hash() << "\n"
                      << "  product_slug:   " << tok.product_slug  << "\n"
                      << "  offline_jwt:    " << r.token           << "\n";

        } else if (cmd == "checkin") {
            if (!product_slug.empty() && !machine_secret.empty()) {
                LicenseClient client(url);
                auto r = client.machine_checkin(product_slug, machine_secret);
                std::cout << "Check-in OK.\n"
                          << "  Expires at: " << r.expires_at << "\n"
                          << "  offline_jwt:" << r.token      << "\n";

            } else if (!license_key.empty() && !app_secret.empty()) {
                LicenseClient client(url, app_secret);
                auto r = client.checkin(license_key);
                std::cout << "Check-in OK (legacy).\n"
                          << "  Expires at: " << r.expires_at << "\n"
                          << "  offline_jwt:" << r.token      << "\n";

            } else {
                std::cerr << "Error: checkin requires either\n"
                          << "  --product-slug + --machine-secret  (preferred), or\n"
                          << "  --license-key + --app-secret       (legacy).\n\n";
                print_usage(argv[0]);
                return 1;
            }

        } else if (cmd == "verify") {
            if (offline_jwt.empty()) {
                std::cerr << "Error: verify requires --offline-jwt.\n\n";
                print_usage(argv[0]);
                return 1;
            }
            if (public_key.empty()) {
                std::cerr << "Error: verify requires --public-key.\n\n";
                print_usage(argv[0]);
                return 1;
            }

            LicenseVerifier verifier(read_file(public_key), checkpoint);
            auto vr = verifier.verify(offline_jwt);
            std::cout << "JWT is valid.\n"
                      << "  license=" << vr.license << "\n"
                      << "  machine=" << vr.machine << "\n"
                      << "  product=" << vr.product << "\n"
                      << "  exp="     << vr.exp     << "\n";
            if (vr.clock_skew_seconds > 0)
                std::cout << "  clock_skew=" << vr.clock_skew_seconds << "s (local clock appears slow)\n";

        } else {
            std::cerr << "Unknown command: " << cmd << "\n\n";
            print_usage(argv[0]);
            return 1;
        }

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
