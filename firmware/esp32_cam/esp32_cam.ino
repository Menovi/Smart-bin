/**
 * SmartBin ESP32-CAM — captures a JPEG every CAPTURE_INTERVAL_MS and POSTs it
 * to the FastAPI /api/detect endpoint.
 *
 * Board: AI Thinker ESP32-CAM
 * Tools > Partition Scheme: Huge APP (3MB)
 *
 * Libraries:
 *   - esp32-camera (built-in with ESP32 board package)
 *   - HTTPClient (built-in)
 */
#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* DETECT_URL = "http://YOUR-SERVER:8000/api/detect";
const char* BIN_ID = "BIN-001";
const uint32_t CAPTURE_INTERVAL_MS = 30000;   // every 30 s

void initCamera() {
  camera_config_t c;
  c.ledc_channel = LEDC_CHANNEL_0; c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM;
  c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM;
  c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM; c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000; c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;     // 640x480
  c.jpeg_quality = 12; c.fb_count = 1;
  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) { Serial.printf("cam init fail 0x%x\n", err); ESP.restart(); }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(WiFi.localIP());
  initCamera();
}

void loop() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { Serial.println("capture fail"); delay(2000); return; }

  HTTPClient http;
  String url = String(DETECT_URL);
  // multipart body
  String boundary = "----esp32cam";
  http.begin(url);
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);

  String head =
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"bin_id\"\r\n\r\n" + BIN_ID + "\r\n"
    "--" + boundary + "\r\n"
    "Content-Disposition: form-data; name=\"file\"; filename=\"frame.jpg\"\r\n"
    "Content-Type: image/jpeg\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";

  size_t totalLen = head.length() + fb->len + tail.length();
  uint8_t* buf = (uint8_t*)malloc(totalLen);
  if (!buf) { esp_camera_fb_return(fb); return; }
  memcpy(buf, head.c_str(), head.length());
  memcpy(buf + head.length(), fb->buf, fb->len);
  memcpy(buf + head.length() + fb->len, tail.c_str(), tail.length());

  int code = http.POST(buf, totalLen);
  Serial.printf("POST %d  %s\n", code, http.getString().c_str());
  free(buf); http.end(); esp_camera_fb_return(fb);

  delay(CAPTURE_INTERVAL_MS);
}
