var wifi = require('Wifi');
var MQTT = require("MQTT");

var WIFI_NAME = "kolinet_out";
var WIFI_OPTIONS = { password : "abcabcabca" };

var WIFI_REPEAT_PERIOD = 5000;
var MQTT_REPEAT_PERIOD = 5000;
var MQTT_FAILS_TO_RESTART = 10;
var KEEP_ALIVE_PERIOD = 300000;
var KEEP_ALIVE_MAX_CYCLES = 288; // cca 1 den

var MQTT_SERVER = "192.168.1.103";
var MQTT_OPTIONS = {
    client_id : getSerial(),
    keep_alive: 60,         // keep alive time in seconds
    port: 1883,             // port number
    clean_session: true,
    protocol_name: "MQTT",
    username: 'smarthome',
    password: 'sobesice'
};

var mqtt;
var connectionTimer = null;
var keepAliveTimer = null;
var mqttReady = false;
var mqttFails = 0;
var keepAliveCycles = 0;

var signals = {
	filtering: {on: "\xA0\x01\x01\xA2", off: "\xA0\x01\x00\xA1"},
	heating: {on: "\xA0\x02\x01\xA3", off: "\xA0\x02\x00\xA2"}
};

var status = {
    filtering: false,
	heating: false,
};

Serial1.setup(115200, { tx: D1, rx: D3 });

mqtt = MQTT.create(MQTT_SERVER, MQTT_OPTIONS);

mqtt.on('connected', () => {
    clearTimeout(connectionTimer);
    console.log("MQTT connected");
    mqtt.subscribe("smarthome/controls/pool");
    keepAlive();
});

mqtt.on('disconnected', () => {
    mqttReady = false;
    console.log("MQTT disconnected");
    clearTimeout(keepAliveTimer);
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
        connectMQTT();
    }, MQTT_REPEAT_PERIOD);
});

mqtt.on('error', () => {
     mqttReady = false;
     console.log("MQTT error");
     clearTimeout(keepAliveTimer);
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
    connectWifi();
}

function connectWifi() {
  wifi.connect(WIFI_NAME, WIFI_OPTIONS, (err) => {
    if (err) {
      console.log('Wifi connection failed');
      clearTimeout(connectionTimer);
      connectionTimer = setTimeout(() => {
        connectWifi();
      }, WIFI_REPEAT_PERIOD);
    } else {
       console.log("Wifi connected");
       connectMQTT();
    }
  });

  wifi.on('disconnected', () => {
    console.log('Wifi disconnected');
    clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
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
    if(data.action != 'undefined') {
        setPower(data.action, data.status);
    }
}

function setPower(relay, power) {
	status[relay] = power;
	Serial1.write(signals[relay][power ? 'on' : 'off']);
	console.log(relay + ': ' + (power ? 'on' : 'off'));
	sendStatus();
}

function sendStatus() {
	if(mqttReady) {
      var topic = "smarthome/pool";
      mqtt.publish(topic, JSON.stringify(status), 2, true);
    } else {
      console.log("MQTT not ready"); 
      mqttFails++;
    }
}

function keepAlive() {
  clearTimeout(keepAliveTimer);
  if(mqttFails > MQTT_FAILS_TO_RESTART || keepAliveCycles > KEEP_ALIVE_MAX_CYCLES) {
     load();
  }
  keepAliveTimer = setTimeout(() => {
  	sendStatus();
    keepAlive();
  }, KEEP_ALIVE_PERIOD);
}

init();