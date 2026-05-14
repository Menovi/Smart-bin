/**
 * SmartBin ESP32 firmware — HC-SR04 fill sensor + battery + WiFi + MQTT
 *
 * Hardware:
 *   ESP32 DevKit
 *   HC-SR04 ultrasonic sensor: TRIG=GPIO5, ECHO=GPIO18
 *   Battery voltage divider on GPIO34 (ADC1_CH6)
 *
 * Libraries (Arduino Library Manager):
 *   - PubSubClient by Nick O'Leary
 *   - ArduinoJson by Benoit Blanchon
 */
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---- USER CONFIG -----------------------------------------------------------
const char* WIFI_SSID = "your-ssid";
const char* WIFI_PASS = "your-password";
const char* MQTT_HOST = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;
const char* BIN_ID    = "BIN-001";
const char* BIN_NAME  = "Library Front";
const float BIN_LAT   = 13.0103;
const float BIN_LNG   = 74.7940;
const float BIN_CAPACITY_CM = 80.0;
const uint32_t PUBLISH_INTERVAL_MS = 5000;

// ---- PINS ------------------------------------------------------------------
const uint8_t TRIG_PIN = 5;
const uint8_t ECHO_PIN = 18;
const uint8_t BATT_PIN = 34;     // ADC1_CH6 with 1:2 divider

// ---- GLOBALS ---------------------------------------------------------------
WiFiClient espClient;
PubSubClient mqtt(espClient);
char topic_telemetry[64];

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (dur == 0) return BIN_CAPACITY_CM;     // out of range -> empty
  return dur * 0.0343f / 2.0f;
}

float readBatteryPct() {
  // assumes 4.2V full -> 3.3V cutoff, with 1:2 divider feeding ADC
  int raw = analogRead(BATT_PIN);
  float v = raw * 3.3f / 4095.0f * 2.0f;
  float pct = (v - 3.3f) / (4.2f - 3.3f) * 100.0f;
  if (pct < 0) pct = 0; if (pct > 100) pct = 100;
  return pct;
}

void wifiConnect() {
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println(); Serial.print("IP "); Serial.println(WiFi.localIP());
}

void mqttConnect() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  while (!mqtt.connected()) {
    String cid = String("smartbin-") + BIN_ID;
    if (mqtt.connect(cid.c_str())) Serial.println("MQTT ok");
    else { Serial.print("MQTT rc="); Serial.println(mqtt.state()); delay(2000); }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT);
  snprintf(topic_telemetry, sizeof(topic_telemetry), "smartbin/%s/telemetry", BIN_ID);
  wifiConnect(); mqttConnect();
}

void loop() {
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();

  static uint32_t last = 0;
  if (millis() - last >= PUBLISH_INTERVAL_MS) {
    last = millis();
    float d = readDistanceCm();
    if (d > BIN_CAPACITY_CM) d = BIN_CAPACITY_CM;
    float fill = (1.0f - d / BIN_CAPACITY_CM) * 100.0f;
    if (fill < 0) fill = 0; if (fill > 100) fill = 100;
    float batt = readBatteryPct();

    StaticJsonDocument<256> doc;
    doc["name"] = BIN_NAME;
    doc["lat"] = BIN_LAT; doc["lng"] = BIN_LNG;
    doc["capacity_cm"] = BIN_CAPACITY_CM;
    doc["distance_cm"] = d;
    doc["fill_pct"] = fill;
    doc["battery_pct"] = batt;
    doc["rssi"] = WiFi.RSSI();
    char buf[256]; size_t n = serializeJson(doc, buf);
    mqtt.publish(topic_telemetry, (uint8_t*)buf, n);
    Serial.print("pub "); Serial.println(buf);
  }
}
