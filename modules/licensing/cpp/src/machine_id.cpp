#include "machine_id.h"
#include <stdexcept>
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <cctype>

// ============================================================================
//  Small shared helpers
// ============================================================================
namespace {

    // Trim trailing CR/LF/space/tab and leading space from an id-like string.
    std::string trim(const std::string& in) {
        size_t b = in.find_first_not_of(" \t\r\n");
        if (b == std::string::npos) return "";
        size_t e = in.find_last_not_of(" \t\r\n");
        return in.substr(b, e - b + 1);
    }

    // Normalise a MAC into upper-case colon-separated form, or "" if it doesn't
    // look like a MAC. Filters out all-zero / loopback addresses.
    std::string normalize_mac(const std::string& raw) {
        std::string hex;
        for (char c : raw) {
            if (std::isxdigit(static_cast<unsigned char>(c)))
                hex.push_back(static_cast<char>(std::toupper(static_cast<unsigned char>(c))));
        }
        if (hex.size() != 12) return "";
        if (hex == "000000000000") return "";
        std::string out;
        for (size_t i = 0; i < 12; i += 2) {
            if (!out.empty()) out.push_back(':');
            out.push_back(hex[i]);
            out.push_back(hex[i + 1]);
        }
        return out;
    }

} // namespace


#if defined(_WIN32)
// ============================================================================
//  Windows
// ============================================================================
#include <windows.h>
#include <comdef.h>
#include <WbemIdl.h>

#pragma comment(lib, "wbemuuid.lib")

// ---- original registry-based single-arg version (kept, lightly cleaned) ----
std::string get_raw_machine_id() {
    HKEY hKey;
    LONG rc = RegOpenKeyExA(HKEY_LOCAL_MACHINE,
        "SOFTWARE\\Microsoft\\Cryptography",
        0, KEY_READ | KEY_WOW64_64KEY, &hKey);
    if (rc != ERROR_SUCCESS)
        throw std::runtime_error("Cannot open Cryptography registry key");

    char  buf[256] = {};
    DWORD size = sizeof(buf);
    DWORD type = REG_SZ;
    bool  ok = RegQueryValueExA(hKey, "MachineGuid", nullptr, &type,
        reinterpret_cast<LPBYTE>(buf), &size) == ERROR_SUCCESS;
    RegCloseKey(hKey);
    if (!ok)
        throw std::runtime_error("Cannot read MachineGuid");
    return std::string(buf);
}

// ---- helpers scoped to the WMI implementation --------------------------------
namespace {

    std::string BstrToStdString(BSTR bstr) {
        if (!bstr) return "";
        int wlen = SysStringLen(bstr);
        if (wlen == 0) return "";
        int size_needed = WideCharToMultiByte(CP_UTF8, 0, bstr, wlen, nullptr, 0, nullptr, nullptr);
        if (size_needed <= 0) return "";
        std::string result(size_needed, '\0');
        WideCharToMultiByte(CP_UTF8, 0, bstr, wlen, &result[0], size_needed, nullptr, nullptr);
        return result;
    }

    // RAII guard for CoInitializeEx. Only calls CoUninitialize when this call is
    // the one that actually initialised COM (S_OK). RPC_E_CHANGED_MODE means COM
    // was already initialised in another mode elsewhere -> we must NOT uninit.
    struct ComInit {
        bool must_uninit = false;
        bool ok = false;
        ComInit() {
            HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
            if (hr == S_OK) { ok = true;  must_uninit = true; }
            else if (hr == S_FALSE) { ok = true;  must_uninit = true; } // already init same mode
            else if (hr == RPC_E_CHANGED_MODE) { ok = true; must_uninit = false; }
            else { ok = false; must_uninit = false; }
        }
        ~ComInit() { if (must_uninit) CoUninitialize(); }
        ComInit(const ComInit&) = delete;
        ComInit& operator=(const ComInit&) = delete;
    };

    // Minimal COM smart-pointer: Release on scope exit.
    template <class T>
    struct ComPtr {
        T* p = nullptr;
        ComPtr() = default;
        ~ComPtr() { if (p) p->Release(); }
        T** put() { return &p; }
        T* operator->()   const { return p; }
        T* get()          const { return p; }
        explicit operator bool() const { return p != nullptr; }
        ComPtr(const ComPtr&) = delete;
        ComPtr& operator=(const ComPtr&) = delete;
    };

    // Run a WQL query and hand each matching object to `fn`.
    template <class Fn>
    bool for_each_wmi(IWbemServices* svc, const wchar_t* wql, Fn fn) {
        ComPtr<IEnumWbemClassObject> en;
        HRESULT hr = svc->ExecQuery(
            bstr_t(L"WQL"), bstr_t(wql),
            WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
            nullptr, en.put());
        if (FAILED(hr) || !en) return false;

        for (;;) {
            IWbemClassObject* raw = nullptr;
            ULONG got = 0;
            hr = en->Next(WBEM_INFINITE, 1, &raw, &got);
            if (FAILED(hr) || got == 0 || !raw) break;
            ComPtr<IWbemClassObject> obj; obj.p = raw;
            fn(obj.get());
        }
        return true;
    }

} // namespace

// ---- hardened two-arg version ------------------------------------------------
// Returns true on success (id populated). `mac` is filled best-effort and may
// be empty even on success. Throws std::runtime_error on hard COM failures.
bool get_raw_machine_id(std::string& id, std::vector<std::string>& mac) {
    id.clear();
    mac.clear();

    ComInit com;
    if (!com.ok)
        throw std::runtime_error("CoInitializeEx failed");

    // Best-effort; may legitimately fail with RPC_E_TOO_LATE if already set.
    CoInitializeSecurity(nullptr, -1, nullptr, nullptr,
        RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IMPERSONATE,
        nullptr, EOAC_NONE, nullptr);

    ComPtr<IWbemLocator> loc;
    HRESULT hr = CoCreateInstance(CLSID_WbemLocator, nullptr, CLSCTX_INPROC_SERVER,
        IID_IWbemLocator, reinterpret_cast<LPVOID*>(loc.put()));
    if (FAILED(hr) || !loc)
        throw std::runtime_error("Cannot create IWbemLocator");

    ComPtr<IWbemServices> svc;
    hr = loc->ConnectServer(_bstr_t(L"ROOT\\CIMV2"), nullptr, nullptr, nullptr,
        0, nullptr, nullptr, svc.put());
    if (FAILED(hr) || !svc)
        throw std::runtime_error("Cannot connect to ROOT\\CIMV2");

    hr = CoSetProxyBlanket(svc.get(), RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, nullptr,
        RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE,
        nullptr, EOAC_NONE);
    if (FAILED(hr))
        throw std::runtime_error("CoSetProxyBlanket failed");

    // --- BIOS/SMBIOS UUID ---
    for_each_wmi(svc.get(), L"SELECT UUID FROM Win32_ComputerSystemProduct",
        [&](IWbemClassObject* obj) {
            if (!id.empty()) return;
            VARIANT v; VariantInit(&v);
            if (SUCCEEDED(obj->Get(L"UUID", 0, &v, nullptr, nullptr)) && v.vt == VT_BSTR) {
                std::string s = trim(BstrToStdString(v.bstrVal));
                // Some firmware reports the all-FF placeholder; treat as unusable.
                std::string upper = s;
                std::transform(upper.begin(), upper.end(), upper.begin(),
                    [](unsigned char c) { return std::toupper(c); });
                if (upper != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" &&
                    upper != "00000000-0000-0000-0000-000000000000")
                    id = s;
            }
            VariantClear(&v);
        });

    // --- PCI NIC MAC addresses (skip USB / virtual) ---
    for_each_wmi(svc.get(),
        L"SELECT MACAddress, Name FROM Win32_NetworkAdapter "
        L"WHERE PNPDeviceID LIKE 'PCI\\\\%' AND MACAddress IS NOT NULL",
        [&](IWbemClassObject* obj) {
            VARIANT vm; VariantInit(&vm);
            if (SUCCEEDED(obj->Get(L"MACAddress", 0, &vm, nullptr, nullptr)) && vm.vt == VT_BSTR) {
                std::string m = normalize_mac(BstrToStdString(vm.bstrVal));
                if (!m.empty() &&
                    std::find(mac.begin(), mac.end(), m) == mac.end())
                    mac.push_back(m);
            }
            VariantClear(&vm);
        });

    if (id.empty()) {
        // Fall back to the registry GUID so callers still get *something* stable.
        try { id = get_raw_machine_id(); }
        catch (...) {}
    }

    std::sort(mac.begin(), mac.end());
    return !id.empty();
}


#elif defined(__APPLE__)
// ============================================================================
//  macOS
// ============================================================================
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/network/IOEthernetInterface.h>
#include <IOKit/network/IONetworkInterface.h>
#include <IOKit/network/IOEthernetController.h>

// ---- original single-arg version --------------------------------------------
std::string get_raw_machine_id() {
    io_service_t platform = IOServiceGetMatchingService(
        kIOMainPortDefault, IOServiceMatching("IOPlatformExpertDevice"));
    if (!platform)
        throw std::runtime_error("Cannot get IOPlatformExpertDevice");

    CFStringRef serial = reinterpret_cast<CFStringRef>(
        IORegistryEntryCreateCFProperty(platform, CFSTR("IOPlatformSerialNumber"),
            kCFAllocatorDefault, 0));
    IOObjectRelease(platform);
    if (!serial)
        throw std::runtime_error("Cannot get IOPlatformSerialNumber");

    char buf[256] = {};
    CFStringGetCString(serial, buf, sizeof(buf), kCFStringEncodingUTF8);
    CFRelease(serial);
    return std::string(buf);
}

namespace {

    std::string cfstring_to_std(CFStringRef s) {
        if (!s) return "";
        char buf[512] = {};
        if (CFStringGetCString(s, buf, sizeof(buf), kCFStringEncodingUTF8))
            return std::string(buf);
        return "";
    }

    // Prefer the hardware UUID (IOPlatformUUID); fall back to serial number.
    std::string mac_platform_id() {
        io_service_t platform = IOServiceGetMatchingService(
            kIOMainPortDefault, IOServiceMatching("IOPlatformExpertDevice"));
        if (!platform) return "";

        std::string result;
        if (CFStringRef uuid = reinterpret_cast<CFStringRef>(
            IORegistryEntryCreateCFProperty(platform, CFSTR("IOPlatformUUID"),
                kCFAllocatorDefault, 0))) {
            result = cfstring_to_std(uuid);
            CFRelease(uuid);
        }
        if (result.empty()) {
            if (CFStringRef serial = reinterpret_cast<CFStringRef>(
                IORegistryEntryCreateCFProperty(platform, CFSTR("IOPlatformSerialNumber"),
                    kCFAllocatorDefault, 0))) {
                result = cfstring_to_std(serial);
                CFRelease(serial);
            }
        }
        IOObjectRelease(platform);
        return trim(result);
    }

    // Enumerate built-in Ethernet controllers and collect their permanent MACs.
    void collect_macs(std::vector<std::string>& out) {
        CFMutableDictionaryRef match = IOServiceMatching(kIOEthernetInterfaceClass);
        if (!match) return;

        // Restrict to primary/built-in interfaces to mirror the Windows "PCI, not USB".
        CFMutableDictionaryRef props = CFDictionaryCreateMutable(
            kCFAllocatorDefault, 0,
            &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
        CFDictionarySetValue(props, CFSTR(kIOPrimaryInterface), kCFBooleanTrue);
        CFDictionarySetValue(match, CFSTR(kIOPropertyMatchKey), props);
        CFRelease(props);

        io_iterator_t it = 0;
        if (IOServiceGetMatchingServices(kIOMainPortDefault, match, &it) != KERN_SUCCESS)
            return;

        io_object_t intf = 0;
        while ((intf = IOIteratorNext(it)) != 0) {
            io_object_t controller = 0;
            if (IORegistryEntryGetParentEntry(intf, kIOServicePlane, &controller) == KERN_SUCCESS) {
                CFTypeRef data = IORegistryEntryCreateCFProperty(
                    controller, CFSTR(kIOMACAddress), kCFAllocatorDefault, 0);
                if (data && CFGetTypeID(data) == CFDataGetTypeID()) {
                    CFDataRef d = reinterpret_cast<CFDataRef>(data);
                    if (CFDataGetLength(d) == 6) {
                        const UInt8* b = CFDataGetBytePtr(d);
                        char tmp[18];
                        std::snprintf(tmp, sizeof(tmp), "%02X:%02X:%02X:%02X:%02X:%02X",
                            b[0], b[1], b[2], b[3], b[4], b[5]);
                        std::string m = normalize_mac(tmp);
                        if (!m.empty() &&
                            std::find(out.begin(), out.end(), m) == out.end())
                            out.push_back(m);
                    }
                }
                if (data) CFRelease(data);
                IOObjectRelease(controller);
            }
            IOObjectRelease(intf);
        }
        IOObjectRelease(it);
    }

} // namespace

bool get_raw_machine_id(std::string& id, std::vector<std::string>& mac) {
    id.clear();
    mac.clear();
    id = mac_platform_id();
    collect_macs(mac);
    std::sort(mac.begin(), mac.end());
    return !id.empty();
}


#else
// ============================================================================
//  Linux
// ============================================================================
#include <fstream>
#include <cstdio>
#include <sys/types.h>
#include <dirent.h>

// ---- original single-arg version --------------------------------------------
std::string get_raw_machine_id() {
    std::ifstream f("/etc/machine-id");
    if (!f)
        throw std::runtime_error("Cannot open /etc/machine-id");
    std::string id;
    std::getline(f, id);
    id = trim(id);
    if (id.empty())
        throw std::runtime_error("/etc/machine-id is empty");
    return id;
}

namespace {

    std::string read_first_line(const std::string& path) {
        std::ifstream f(path);
        if (!f) return "";
        std::string line;
        std::getline(f, line);
        return trim(line);
    }

    // Preferred stable id: DMI product UUID (needs root to read on many distros),
    // then dbus machine-id, then /etc/machine-id.
    std::string linux_platform_id() {
        std::string s = read_first_line("/sys/class/dmi/id/product_uuid");
        if (!s.empty()) {
            std::string upper = s;
            std::transform(upper.begin(), upper.end(), upper.begin(),
                [](unsigned char c) { return std::toupper(c); });
            if (upper != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" &&
                upper != "00000000-0000-0000-0000-000000000000")
                return s;
        }
        s = read_first_line("/var/lib/dbus/machine-id");
        if (!s.empty()) return s;
        s = read_first_line("/etc/machine-id");
        return s; // may be empty
    }

    // Read /sys/class/net/<iface>/address for physical (non-virtual) interfaces.
    // A NIC is considered physical if /sys/class/net/<iface>/device exists and it
    // is not a wireless/loopback/virtual bridge. This is the closest analogue to
    // the Windows "PCI, not USB" filter.
    void collect_macs(std::vector<std::string>& out) {
        const char* base = "/sys/class/net";
        DIR* d = opendir(base);
        if (!d) return;

        struct dirent* e;
        while ((e = readdir(d)) != nullptr) {
            std::string name = e->d_name;
            if (name == "." || name == ".." || name == "lo") continue;

            std::string dir = std::string(base) + "/" + name;

            // Must be a real device (skip veth, docker0, virbr, bridges, etc.).
            std::string devlink = dir + "/device";
            std::ifstream devcheck(devlink);
            bool has_device = static_cast<bool>(devcheck) ||
                (access(devlink.c_str(), F_OK) == 0);
            if (!has_device) continue;

            // Skip interfaces whose type marks them as non-Ethernet loopback etc.
            // ARPHRD_ETHER == 1.
            std::string type = read_first_line(dir + "/type");
            if (!type.empty() && type != "1") continue;

            std::string m = normalize_mac(read_first_line(dir + "/address"));
            if (!m.empty() &&
                std::find(out.begin(), out.end(), m) == out.end())
                out.push_back(m);
        }
        closedir(d);
    }

} // namespace

bool get_raw_machine_id(std::string& id, std::vector<std::string>& mac) {
    id.clear();
    mac.clear();
    id = linux_platform_id();
    collect_macs(mac);
    std::sort(mac.begin(), mac.end());
    return !id.empty();
}

#endif