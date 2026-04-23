#pragma once
#include "esp_now.h"
#include "esp_wifi.h"
#include "esp_idf_version.h"

// Guarda target y action en un int: high byte = target, low byte = action.
// El filtro por device_id lo aplica el interval en YAML (usa la substitution).
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 0, 0)
void espnow_recv_cb(const esp_now_recv_info_t *info, const uint8_t *data, int len)
#else
void espnow_recv_cb(const uint8_t *mac_addr, const uint8_t *data, int len)
#endif
{
    if (len < 2) return;
    ESP_LOGI("espnow", "RX: target=%d action=%c", data[0], (char)data[1]);
    id(espnow_pending) = ((int)data[0] << 8) | (int)data[1];
}
