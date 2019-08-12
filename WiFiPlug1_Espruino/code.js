var wifi = require('Wifi');
var MQTT = require("MQTT");

var WIFI_NAME = "kolinet_out";
var WIFI_OPTIONS = { password : "abcabcabca" };

var WIFI_REPEAT_PERIOD = 5000;
var MQTT_REPEAT_PERIOD = 5000;
var MQTT_FAILS_TO_RESTART = 10;
var KEEP_ALIVE_PERIOD = 300000;

var MQTT_SERVER = "192.168.1.103";
var MQTT_OPTIONS = {
    client_id : getSerial(),
    keep_alive: 60,         // keep alive time in seconds
    port: 1883,             // port number
    clean_session: true,
    protocol_name: "MQTT"
};

var power = false;
var mqtt;
var connectionTimer = null;
var mqttReady = false;
var mqttFails = 0;

mqtt = MQTT.create(MQTT_SERVER, MQTT_OPTIONS);

mqtt.on('connected', () => {
    clearTimeout(connectionTimer);
    console.log("MQTT connected");
    mqtt.subscribe("smarthome/controls/plug1");
});

mqtt.on('disconnected', () => {
    mqttReady = false;
    console.log("MQTT disconnected");
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
        connectMQTT();
    }, MQTT_REPEAT_PERIOD);
});

mqtt.on('error', () => {
     mqttReady = false;
     console.log("MQTT error");
     clearTimeout(connectionTimer);
     connectionTimer = setTimeout(() => {
       connectMQTT();
     }, MQTT_REPEAT_PERIOD);
});

mqtt.on('subscribed', () => {
    console.log("MQTT subscribed");
    mqttReady = true;
});

mqtt.on('publish', (msg) => handleMqttMessage(msg));

function init() {
    console.log('Starting up...');
    pinMode(D0, 'output');
    digitalWrite(D0, HIGH);
    connectWifi();
    keepAlive();
}

function connectWifi() {
  wifi.connect(WIFI_NAME, WIFI_OPTIONS, (err) => {
    if (err) {
      console.log('Wifi connection failed');
      setTimeout(() => {
        connectWifi();
      }, WIFI_REPEAT_PERIOD);
    } else {
       console.log("Wifi connected");
       connectMQTT();
    }
  });

  wifi.on('disconnected', () => {
    console.log('Wifi disconnected');
    setTimeout(() => {
        connectWifi();
      }, WIFI_REPEAT_PERIOD);
  });
}

function connectMQTT() {
    mqtt.connect();
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
        console.log('MQTT reconnecting...');
        connectMQTT();
  }, MQTT_REPEAT_PERIOD);
}

function handleMqttMessage(msg) {
    var data = JSON.parse(msg.message);
    if(data.power !== undefined) {
        setPower(data.power);
    }
}

function setPower(status) {
  console.log('power: ' + (status ? 'on' : 'off'));
  power = status;
  digitalWrite(D0, power ? LOW : HIGH); // prehozeno zamerne
  sendStatus();
}

function sendStatus() {
  if(mqttReady) {
    var topic = "smarthome/plug1";
    var message = JSON.stringify({power: power});
    mqtt.publish(topic, message, {qos: 2, retain: true});
  } else {
     console.log("MQTT not ready"); 
     mqttFails++;
  }
}

function keepAlive() {
  if(mqttFails > MQTT_FAILS_TO_RESTART) {
     load(); 
  }
  setTimeout(() => {
  	sendStatus();
    keepAlive();
  }, KEEP_ALIVE_PERIOD);
}

init();