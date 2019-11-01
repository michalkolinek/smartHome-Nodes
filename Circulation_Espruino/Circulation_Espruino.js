var wifi = require('Wifi');
var MQTT = require("MQTT");

var WIFI_NAME = "kolinet_ext";
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
    protocol_name: "MQTT",
    username: "smarthome",
    password: "sobesice"
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
    mqtt.subscribe("smarthome/controls/circulation");
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

wifi.on('disconnected', () => {
    console.log('Wifi disconnected');
    setTimeout(() => {
        connectWifi();
    }, WIFI_REPEAT_PERIOD);
});

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
  console.log(data);
    if(data.power !== undefined) {
        setPower(data.power);
    }
}

function setPower(status) {
  power = status;
  digitalWrite(D0, power ? LOW : HIGH); // prehozeno zamerne
  console.log('power: ' + (power ? 'on' : 'off'));
  sendStatus();
}

function sendStatus() {
  if(mqttReady) {
    var topic = "smarthome/circulation";
    var message = JSON.stringify({power: power});
    mqtt.publish(topic, message, {qos: 2, retain: true});
  } else {
     console.log("MQTT not ready"); 
     mqttFails++;
  }
}

function keepAlive() {
  setTimeout(() => {
    sendStatus();
    if(mqttFails > MQTT_FAILS_TO_RESTART) {
    	load();
    } else {
    	keepAlive();
    }
  }, KEEP_ALIVE_PERIOD);
}

init();