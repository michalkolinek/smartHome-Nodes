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

var settings = {
    fullPositionTime: 36.8,
    fullAngleTime: 1.2,
    stepTime: 0.2,
    interval: 0.1
};

var status = {
    position: 0,
    angle: 0,
    moving: false
};

var mqtt;
var connectionTimer = null;
var keepAliveTimer = null;
var mqttReady = false;
var mqttFails = 0;
var moveTimer = null;
var waitDebounce = false;
var debounced = false;

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
    sendStatus();
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

function initMove(direction, duration) {
    clearTimeout(moveTimer);
    stopAll();
    setTimeout(() => {
        move(direction, duration);
    }, 50);
}

function getInitMovingTime(direction, duration) {
    if(direction == 'up' && duration > settings.fullAngleTime) {
        var t = (Math.min(duration, status.position) / settings.fullPositionTime) * -2;
        var m = t % settings.stepTime;
        return t - m;
    } else {
        return -0.1;
    }
}

function move(direction, duration) {
    var movingTime = getInitMovingTime(direction, duration);
    if(direction === 'up') {
        if(canMoveUp()) {
            moveUp(true);
            status.moving = true;
            moveTimer = setInterval(() => {
                console.log(duration, status.angle, status.position, movingTime);
                if(movingTime >= 0) {
                    if(status.angle > 0) {
                      status.angle -= settings.interval;
                    } else {
                      status.position -= settings.interval;
                    }
                }
                movingTime += settings.interval;

                if(movingTime >= duration || !canMoveUp()) {
                    moveUp(false);
                    status.moving = false;
                    clearInterval(moveTimer);
                }
                sendStatus();
            }, settings.interval * 1000);
        } else {
          sendStatus();
        }
    } else {
        if(canMoveDown()) {
            moveDown(true);
            status.moving = true;
            moveTimer = setInterval(() => {
                console.log(duration, status.angle, status.position, movingTime);
                if(movingTime >= 0) {
                    if(status.angle < settings.fullAngleTime) {
                        status.angle += settings.interval;
                    } else {
                        status.position += settings.interval;
                    }
                }
                movingTime += settings.interval;

                if(movingTime >= duration || !canMoveDown()) {
                    moveDown(false);
                    status.moving = false;
                    clearInterval(moveTimer);
                }
                sendStatus();
            }, settings.interval * 1000);
        } else {
          sendStatus();
        }
    }
}

function canMoveUp() {
    return status.position > 0 || status.angle > 0;
}

function canMoveDown() {
    return status.position < settings.fullPositionTime || status.angle < settings.fullAngleTime;
}

function stopAll() {
    clearTimeout(moveTimer);
    moveDown(false);
    setTimeout(() => {
        moveUp(false);
        status.moving = false;
        sendStatus();
    }, 50);
}

function enableAll() {
    clearTimeout(moveTimer);
    moveDown(true);
    setTimeout(() => {moveUp(true);}, 50);
}

function resetPosition() {
    stopAll();
    setTimeout(() => {
        moveUp(true);
        setTimeout(() => {
            moveUp(false);
            status.position = 0;
            status.angle = 0;
            sendStatus();
        }, (settings.fullPositionTime + 5) * 1000);
    }, 100);
}

function handleMqttMessage(msg) {
    var data = JSON.parse(msg.message);
    if(data.room === ROOM) {
        switch(data.action) {
            case 'step-up' : move('up', settings.stepTime); break;
            case 'step-down' : move('down', settings.stepTime); break;
            case 'open' : move('up', settings.fullAngleTime); break;
            case 'close' : move('down', settings.fullAngleTime); break;
            case 'full-up' : move('up', settings.fullPositionTime + settings.fullAngleTime); break;
            case 'full-down' : move('down', settings.fullPositionTime + settings.fullAngleTime); break;
            case 'stop' : stopAll(); break;
            case 'reset' : resetPosition(); break;
        }
    }
}

function sendStatus() {
	if(mqttReady) {
      if(waitDebounce) {
          debounced = true;
          return;
      } else {
          const topic = "smarthome/blinds";
          var data = {
              moving: status.moving,
              position: Math.round(status.position / settings.fullPositionTime * 100),
              angle: Math.round(status.angle / settings.fullAngleTime * 100),
          };
          const msg =  JSON.stringify({room: ROOM, status: data});
          mqtt.publish(topic, msg, {qos: 1, retain: true});
          waitDebounce = true;
          setTimeout(() => {
              waitDebounce = false;
              if(debounced) {
                  debounced = false;
                  sendStatus();
              }
          }, 1000);
      }
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