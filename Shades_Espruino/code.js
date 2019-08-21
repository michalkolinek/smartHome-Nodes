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

var ROOM = 'office';

var status = 'up-open';
var mqtt;
var connectionTimer = null;
var keepAliveTimer = null;
var mqttReady = false;
var mqttFails = 0;
var moveTimer = null;

mqtt = MQTT.create(MQTT_SERVER, MQTT_OPTIONS);

mqtt.on('connected', () => {
    clearTimeout(connectionTimer);
    console.log("MQTT connected");
    mqtt.subscribe("smarthome/controls/blinds");
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

pinMode(D2, 'input');
Serial1.setup(115200, { tx: D1, rx: D3 });

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
            status = 'middle-open';
            moveTimer = setTimeout(() => {
                moveUp(false);
                console.log('stopped up');
                status = 'up-open';
            }, duration * 1000);
        }, 50);
    } else {
        console.log('moving down');
        moveUp(false);
        setTimeout(() => {
            moveDown(true);
            status = 'middle-closed';
            moveTimer = setTimeout(() => {
                moveDown(false);
                status = 'down-closed';
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

function sendStatus() {
	if(mqttReady) {
      const topic = "smarthome/blinds";
      const msg = {room: ROOM, status: status}
      mqtt.publish(topic, JSON.stringify(msg), 2, true);
    } else {
      console.log("MQTT not ready");
      mqttFails++;
    }
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