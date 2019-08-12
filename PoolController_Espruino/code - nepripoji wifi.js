var wifi = require('Wifi');

var WIFI_NAME = "kolinet_2.4GHz";
var WIFI_OPTIONS = { password : "abcabcabca" };

var WIFI_REPEAT_PERIOD = 5000;

function onInit() {
 init(); 
}

function init() {
    console.log('Starting up...');
    connectWifi();
}

function connectWifi() {
  wifi.connect(WIFI_NAME, WIFI_OPTIONS, (err) => {
    if (err) {
      console.log('Wifi connection failed', err);
    } else {
       console.log("Wifi connected");
    }
  });
}

function scan() {
   console.log('Scanning...');
   wifi.scan((list) => console.log(list.length)); 
}