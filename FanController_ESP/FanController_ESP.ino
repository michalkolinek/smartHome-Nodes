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
#define UPDATE_TOPIC "smarthome/fan"
#define CONTROL_TOPIC "smarthome/controls/fan"
#define CYCLE_PERIOD 100
#define RETRY_PERIOD 5000

#define SENSOR_DATA_PIN 2
#define SENSOR_POWER_PIN 0

const char* ssid = STASSID;
const char* password = STAPSK;
const char* powerOn = "1";
const char* powerOff = "0";

bool power;
bool touch;

WiFiClient client;
void callback(char *topic, byte *payload, unsigned int length);
PubSubClient mqtt(MQTT_SERVER, MQTT_PORT, callback, client);

void handleTouch() {
  touch = true;
}

void setup() {
  Serial.begin(9600);
  power = false;
  touch = false;
  pinMode(SENSOR_DATA_PIN, INPUT_PULLUP);
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(SENSOR_DATA_PIN), handleTouch, RISING);
    
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  while (WiFi.waitForConnectResult() != WL_CONNECTED) {
    Serial.println("Connection Failed! Rebooting...");
    delay(5000);
    ESP.restart();
  }  
  setupOTA();

  digitalWrite(SENSOR_POWER_PIN, HIGH);
}

boolean mqttconnect() {
  if (!mqtt.connected()) {
    Serial.println("MQTT not connected, code: ");
    Serial.println(mqtt.state());
    if (mqtt.connect(CLIENTID)) {
      Serial.println("MQTT connected!");
      if(mqtt.subscribe(CONTROL_TOPIC, 1)) {        
        Serial.println("MQTT subscribed!");
      }
    } else {
      Serial.println("MQTT cannot connect to broker, connection retry in 5 seconds");
      delay(RETRY_PERIOD);
    }
  }
  return mqtt.connected();
}

void callback(char *topic, byte *payload, unsigned int length)
{
  Serial.println("MSG received");
  Serial.println(payload[0]);
  if(payload[0] == (byte)powerOn[0]) {
    power = true;
    switchOn();
  } else if(payload[0] == (byte)powerOff[0]) {
    power = false;
    switchOff();
  }
  Serial.println("Power switched remotely.");
  Serial.println(power);
}

void setupOTA() {
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else { // U_SPIFFS
      type = "filesystem";
    }

    // NOTE: if updating SPIFFS this would be the place to unmount SPIFFS using SPIFFS.end()
    Serial.println("Start updating " + type);
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\nEnd");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Auth Failed");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Begin Failed");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Connect Failed");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Receive Failed");
    } else if (error == OTA_END_ERROR) {
      Serial.println("End Failed");
    }
  });
  ArduinoOTA.begin();
  Serial.println("Ready UPDATED");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void switchOn() {
  Serial.write("\xa0\x01\x01\xa2"); // CLOSE RELAY
  Serial.write(0x00); // null terminates a string so it has to be sent on its own
  Serial.write(0xa1);
  mqtt.publish(UPDATE_TOPIC, powerOn, true);
}

void switchOff() {
  Serial.write("\xa0\x01"); // OPEN RELAY
  Serial.write(0x00); // null terminates a string so it has to be sent on its own
  Serial.write(0xa1);
  mqtt.publish(UPDATE_TOPIC, powerOff, true);
}

void loop() {
  ArduinoOTA.handle();
 
  mqttconnect();

  if(touch) {
    power = !power;
    touch = false;
    Serial.println("Touch");

    if(power) {
      switchOn();
    } else {
      switchOff();
    }
  }

  mqtt.loop();

  delay(CYCLE_PERIOD);
}
