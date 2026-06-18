#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── WiFi credentials (your phone hotspot) ──────────────────
const char* WIFI_SSID     = "YOUR_HOTSPOT_NAME";
const char* WIFI_PASSWORD = "YOUR_HOTSPOT_PASSWORD";

// ── Backend URL ────────────────────────────────────────────
const char* SERVER_URL = "https://smartbin-api.onrender.com/api/prototype/reading";

// ── Pin definitions ────────────────────────────────────────
#define TRIG_PIN  5
#define ECHO_PIN  18
#define RED_LED   25
#define GREEN_LED 26

// ── Config ─────────────────────────────────────────────────
const float BIN_DEPTH_CM       = 30.0;
const int   CHECK_INTERVAL_SEC = 30;    // Deep sleep duration between readings
const int   WIFI_TIMEOUT_MS    = 15000;

// ───────────────────────────────────────────────────────────

void setLEDs(int red, int green) {
  digitalWrite(RED_LED, red);
  digitalWrite(GREEN_LED, green);
}

void updateLEDs(float fillPct) {
  if (fillPct < 70) {
    setLEDs(LOW, HIGH);   // Green: normal
  } else if (fillPct < 90) {
    setLEDs(HIGH, HIGH);  // Both: warning
  } else if (fillPct < 100) {
    setLEDs(HIGH, LOW);   // Red: critical
  } else {
    for (int i = 0; i < 6; i++) {
      setLEDs(HIGH, LOW);
      delay(250);
      setLEDs(LOW, LOW);
      delay(250);
    }
  }
}

float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1;
  return duration * 0.0343 / 2;
}

float getStableFillPercent(float* distOut) {
  float total = 0;
  int valid = 0;
  for (int i = 0; i < 5; i++) {
    float d = measureDistance();
    if (d > 2 && d < 400) { total += d; valid++; }
    delay(60);
  }
  if (valid == 0) { *distOut = -1; return -1; }
  float avg = total / valid;
  *distOut = avg;
  float pct = ((BIN_DEPTH_CM - avg) / BIN_DEPTH_CM) * 100;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

String getStatus(float pct) {
  if (pct >= 100) return "OVERFLOW";
  if (pct >= 90)  return "CRITICAL";
  if (pct >= 70)  return "WARNING";
  return "NORMAL";
}

bool connectWiFi() {
  Serial.print("[wifi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_TIMEOUT_MS) {
      Serial.println("\n[wifi] Timeout — no connection");
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.print("\n[wifi] Connected, IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

bool sendTelemetry(float fillPct, float distCm, String status) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Payload matches PrototypeReading schema in backend/routes/prototype.py
  StaticJsonDocument<200> doc;
  doc["fill_pct"]    = fillPct;
  doc["status"]      = status;
  doc["distance_cm"] = distCm;
  doc["battery_pct"] = 100.0;  // No battery sensor on this board

  String body;
  serializeJson(doc, body);

  Serial.print("[http] POST → ");
  Serial.println(body);

  int code = http.POST(body);
  String response = http.getString();
  http.end();

  if (code == 200) {
    Serial.print("[http] OK 200 — ");
    Serial.println(response);
    return true;
  } else {
    Serial.print("[http] Failed, HTTP ");
    Serial.print(code);
    Serial.print(" — ");
    Serial.println(response);
    return false;
  }
}

void goToSleep() {
  setLEDs(LOW, LOW);
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  Serial.print("[sleep] Deep sleep for ");
  Serial.print(CHECK_INTERVAL_SEC);
  Serial.println("s...");
  Serial.flush();
  esp_sleep_enable_timer_wakeup((uint64_t)CHECK_INTERVAL_SEC * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);

  delay(500);
  Serial.println("\n=== Smart Bin Awake ===");

  // 1. Take sensor reading
  float distCm;
  float fill = getStableFillPercent(&distCm);

  if (fill < 0) {
    Serial.println("[sensor] Error — check HC-SR04 wiring");
    setLEDs(LOW, LOW);
    goToSleep();
    return;
  }

  String status = getStatus(fill);
  Serial.print("[sensor] Fill: ");
  Serial.print(fill, 1);
  Serial.print("%  Dist: ");
  Serial.print(distCm, 1);
  Serial.print("cm  Status: ");
  Serial.println(status);

  // 2. Show fill level on LEDs
  updateLEDs(fill);

  // 3. Connect to WiFi and POST to backend
  if (connectWiFi()) {
    bool sent = sendTelemetry(fill, distCm, status);
    if (!sent) {
      // 2 red blinks = HTTP send failed (server reachable but error)
      for (int i = 0; i < 2; i++) {
        setLEDs(HIGH, LOW); delay(300);
        setLEDs(LOW, LOW);  delay(300);
      }
    }
  } else {
    // 4 alternating blinks = WiFi failed
    for (int i = 0; i < 4; i++) {
      setLEDs(HIGH, HIGH); delay(200);
      setLEDs(LOW, LOW);   delay(200);
    }
  }

  delay(2000);  // Keep LEDs visible briefly before sleep
  goToSleep();
}

void loop() {
  // Never reached — deep sleep restarts setup() on wake
}
