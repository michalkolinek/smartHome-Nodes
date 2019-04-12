var wifi = require('Wifi');
var MQTT = require("MQTT");

var WIFI_NAME = "kolinet_2.4GHz";
var WIFI_OPTIONS = { password : "abcabcabca" };

var WIFI_REPEAT_PERIOD = 5000;
var MQTT_REPEAT_PERIOD = 5000;
var MEASURING_PERIOD = 5000;
var REPORTING_PERIOD = 60000;

var MQTT_SERVER = "192.168.1.103";
var MQTT_OPTIONS = {
    client_id : getSerial(),
    keep_alive: 60,         // keep alive time in seconds
    port: 1883,             // port number
    clean_session: true,
    protocol_name: "MQTT"
};

var power = false;
var connectionTimer = null;
var state = false;
var values = [];
var counter = 0;
var mqtt;
var connectionTimer = null;
var mqttReady = false;

mqtt = MQTT.create(MQTT_SERVER, MQTT_OPTIONS);

mqtt.on('connected', () => {
    clearInterval(connectionTimer);
    console.log("MQTT connected");
    mqttReady = true;
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

function onInit() {
  console.log('onInit');
  init();
}

function init() {
    console.log('Starting up...');
    connectWifi();

    pinMode(D0, 'output');
    pinMode(D2, 'input');
    setWatch((event) => {
      counter++;
      state = !state;
      digitalWrite(D0, state);
    }, D2, {repeat: true, edge: 'falling', debounce: 20});

    setInterval(() => {
        this.measure();
    }, MEASURING_PERIOD);

    setInterval(() => {
        this.sendReport();
    }, REPORTING_PERIOD);
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

function measure() {
  console.log(counter);
    values.push(counter);
    counter = 0;
}

function sendReport() {
    var avg = values.reduce((sum, val) => sum + val, 0);
    var max = values.reduce((max, val) => Math.max(max, val), 0);
    values = [];
    if(mqttReady) {
        mqtt.publish('smarthome/anemometer', JSON.stringify({avg: avg, max: max}), 0, false); 
    }
}


init();