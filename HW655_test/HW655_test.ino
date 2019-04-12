#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <ArduinoOTA.h>
#include <stdio.h>
#include <PubSubClient.h>
#include <string.h>

#define STASSID "kolinet_2.4GHz"
#define STAPSK  "abcabcabca"

#define MQTT_SERVER  "home.websense.cz"
#define MQTT_PORT 1883
#define USER  NULL
#define PASS  NULL
#define CLIENTID "fan"
#define UPDATE_TOPIC "/smarthome/fan"
#define CONTROL_TOPIC "/smarthome/controls/fan"
#define CYCLE_PERIOD 100
#define RETRY_PERIOD 5000

#define SENSOR_PIN 2
#define POWER_PIN 0

const char* ssid = STASSID;
const char* password = STAPSK;
const char* powerOn = "1";
const char* powerOff = "0";

bool power;
bool touch;

void setup() {
  Serial.begin(9600);
}

void loop() {
 Serial.write("\xa0\x01\x01\xa2"); // CLOSE RELAY
 delay(1000);
 Serial.write("\xa0\x01"); // OPEN RELAY
 Serial.write(0x00); // null terminates a string so it has to be sent on its own
 Serial.write(0xa1);
 delay(1000);
}
