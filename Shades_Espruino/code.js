var wifi = require('Wifi');
var MQTT = require("MQTT");

var WIFI_NAME = "kolinet_2.4GHz";
var WIFI_OPTIONS = { password : "abcabcabca" };

var WIFI_REPEAT_PERIOD = 5000;
var MQTT_REPEAT_PERIOD = 5000;
var KEEP_ALIVE_PERIOD = 60000;

var MQTT_SERVER = "192.168.1.103";
var MQTT_OPTIONS = {
    client_id : getSerial(),
    keep_alive: 60,         // keep alive time in seconds
    port: 1883,             // port number
    clean_session: true,
    protocol_name: "MQTT"
};

var ROOM = 'office';

var power = false;
var mqtt;
var connectionTimer = null;
var mqttReady = false;
var moveTimer = null;

mqtt = MQTT.create(MQTT_SERVER, MQTT_OPTIONS);

mqtt.on('connected', () => {
    clearInterval(connectionTimer);
    console.log("MQTT connected");
    mqttReady = true;
    mqtt.subscribe("smarthome/controls/blinds");
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

pinMode(D2, 'input');
Serial1.setup(115200, { tx: D1, rx: D3 });

function onInit() {
  console.log('onInit');
  init();
}

function init() {
    console.log('Starting up...');
    connectWifi();
    //keepAlive();
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

function moveUp(status) {
    if(status) {
        Serial1.write("\xA0\x01\x01\xA2");
    } else {
        Serial1.write("\xA0\x01\x00\xA1");
    }
}

function moveDown(status) {
    if(status) {
        Serial1.write("\xA0\x02\x01\xA3");
    } else {
        Serial1.write("\xA0\x02\x00\xA2");
    }
}

function move(direction, duration) {
    clearTimeout(moveTimer);

    if(direction === 'up') {
        console.log('moving up');
        moveDown(false);
        setTimeout(() => {
            moveUp(true);
            moveTimer = setTimeout(() => {
                moveUp(false);
                console.log('stopped up');
            }, duration * 1000);
        }, 50);
    } else {
        console.log('moving down');
        moveUp(false);
        setTimeout(() => {
            moveDown(true);
            moveTimer = setTimeout(() => {
                moveDown(false);
                console.log('stopped down');
            }, duration * 1000);
        }, 50);
    }
}

function stop() {
    clearTimeout(moveTimer);
    moveDown(false);
    moveUp(false);
}

function handleMqttMessage(msg) {
    var data = JSON.parse(msg.message);
    if(data.room === ROOM) {
        if(data.stop) {
            stop();
        } else {
            move(data.direction, data.duration);
        }
    }
}

function keepAlive() {
  setTimeout(() => {
    if(mqttReady) {
      var topic = "smarthome/blinds";
      mqtt.publish(topic, 'ping');
    } else {
      console.log("MQTT not ready"); 
    }
    keepAlive();
  }, KEEP_ALIVE_PERIOD);
}

init();