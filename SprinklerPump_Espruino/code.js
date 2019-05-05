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
    clearInterval(connectionTimer);
    console.log("MQTT connected");
    mqttReady = true;
    mqtt.subscribe("smarthome/controls/sprinkler/pump");
});

mqtt.on('disconnected', () => {
    mqttReady = false;
    console.log("MQTT disconnected");
    clearInterval(connectionTimer);
    setTimeout(() => {
        connectMQTT();
    }, MQTT_REPEAT_PERIOD);
});

mqtt.on('error', () => {
     mqttReady = false;
     console.log("MQTT error");
     clearInterval(connectionTimer);
     setTimeout(() => {
       connectMQTT();
     }, MQTT_REPEAT_PERIOD);
});

mqtt.on('subscribed', () => {
    console.log("MQTT subscribed");
});

mqtt.on('publish', (msg) => handleMqttMessage(msg));


function onInit() {
  console.log('onInit');
  init(); 
}

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
    connectionTimer = setTimeout(() => {
        console.log('MQTT reconnecting...');
        connectMQTT();
  }, MQTT_REPEAT_PERIOD);
}

function handleMqttMessage(msg) {
    var data = JSON.parse(msg.message);

    if(data.action === 'start') {
    	setPower(true);
    }
    if(data.action === 'stop') {
    	setPower(false);
    }
    if(data.action === 'status') {
    	sendStatus();
    }
}

function setPower(status) {
  console.log('Power: ' + (status ? 'ON' : 'OFF'));
  power = status;
  digitalWrite(D0, status ? LOW : HIGH);

  if(mqttReady) {
    var topic = "smarthome/sprinklers/pump";
    var message = JSON.stringify({power: status});
    mqtt.publish(topic, message, {qos: 2, retain: true});
  } else {
     console.log("MQTT not ready"); 
     mqttFails++;
  }
}

function sendStatus() {
	if(mqttReady) {
      var topic = "smarthome/sprinkler/pump";
      mqtt.publish(topic, JSON.stringify({power: power}));
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