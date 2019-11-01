var wifi = require('Wifi');
var MQTT = require("MQTT");

var WIFI_NAME = "kolinet_2.4GHz";
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
    username: 'smarthome',
    password: 'sobesice'
};

var mqtt;
var connectionTimer = null;
var keepAliveTimer = null;
var mqttReady = false;
var mqttFails = 0;
var autoTimer = null;

var signals = {
	light: {on: "\xA0\x01\x01\xA2", off: "\xA0\x01\x00\xA1"},
	pump: {on: "\xA0\x02\x01\xA3", off: "\xA0\x02\x00\xA2"}
};

var status = {
    light: false,
	pump: false,
    moist: 0
};

Serial1.setup(115200, { tx: D1, rx: D3 });

wifi.on('disconnected', () => {
    console.log('Wifi disconnected');
    setTimeout(() => {
        connectWifi();
    }, WIFI_REPEAT_PERIOD);
});

function init() {
    console.log('Starting up...');
    pinMode(D2, 'input');
    setupMQTT();
    connectWifi();
    readMoist();
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

function setupMQTT() {
  mqtt = MQTT.create(MQTT_SERVER, MQTT_OPTIONS);

  mqtt.on('connected', () => {
      clearTimeout(connectionTimer);
      console.log("MQTT connected");
      mqtt.subscribe("smarthome/controls/planter");
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
        if(data.timeout != 'undefined') {
           autoTimer = setTimeout(() => {
               setPower(data.action, !data.status);
           }, data.timeout * 1000);
        }
    }
}

function setPower(relay, power) {
	status[relay] = power;

    console.log(relay + ': ' + (power ? 'on' : 'off'));

    if(relay === 'pump' && power && status.light) {
        console.log('light off temporarilly');
        Serial1.write(signals.light.off);
    }

    setTimeout(() => {
      Serial1.write(signals[relay][power ? 'on' : 'off']);

      setTimeout(() => {
        if(relay === 'pump' && !power && status.light) {
            console.log('light back on');
            Serial1.write(signals.light.on);
        }
        sendStatus();
      }, 1000);
    }, 1000);
}

function sendStatus() {
    readMoist();
}

function send() {
    if(mqttReady) {
        var topic = "smarthome/planter";
        mqtt.publish(topic, JSON.stringify(status), 2, true);
    } else {
        console.log("MQTT not ready"); 
        mqttFails++;
    }
}

function readMoist() {
    digitalWrite(D4, HIGH);
    setTimeout(() => {
        status.moist = 1024 - Math.round(analogRead(A0) * 1024);
        console.log(status.moist);
        send();
        digitalWrite(D4, LOW);
    }, 50);
}

function keepAlive() {
  if(mqttFails > MQTT_FAILS_TO_RESTART) {
     load();
  }
  keepAliveTimer = setTimeout(() => {
  	 sendStatus();
     keepAlive();
  }, KEEP_ALIVE_PERIOD);
}

init();