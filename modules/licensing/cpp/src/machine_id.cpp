#include "machine_id.h"
#include <stdexcept>

#if defined(_WIN32)

#include <windows.h>

std::string get_raw_machine_id() {
    HKEY hKey;
    LONG rc = RegOpenKeyExA(HKEY_LOCAL_MACHINE,
                            "SOFTWARE\\Microsoft\\Cryptography",
                            0, KEY_READ | KEY_WOW64_64KEY, &hKey);
    if (rc != ERROR_SUCCESS)
        throw std::runtime_error("Cannot open Cryptography registry key");

    char   buf[256] = {};
    DWORD  size     = sizeof(buf);
    DWORD  type     = REG_SZ;
    bool   ok       = RegQueryValueExA(hKey, "MachineGuid", nullptr, &type,
                                       reinterpret_cast<LPBYTE>(buf), &size) == ERROR_SUCCESS;
    RegCloseKey(hKey);
    if (!ok)
        throw std::runtime_error("Cannot read MachineGuid");
    return std::string(buf);
}

#elif defined(__APPLE__)

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>

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

#else  // Linux

#include <fstream>
#include <string>

std::string get_raw_machine_id() {
    std::ifstream f("/etc/machine-id");
    if (!f)
        throw std::runtime_error("Cannot open /etc/machine-id");
    std::string id;
    std::getline(f, id);
    while (!id.empty() && (id.back() == '\n' || id.back() == '\r' || id.back() == ' '))
        id.pop_back();
    if (id.empty())
        throw std::runtime_error("/etc/machine-id is empty");
    return id;
}

#endif
