#!/usr/bin/python

import RPi.GPIO as GPIO
import dht11
import time
import datetime
import sys

# setup
pin = 21
powerPin = 20
nodeID = 6
instance = dht11.DHT11(pin)

# initialize GPIO
GPIO.setwarnings(False)
GPIO.setmode(GPIO.BCM)
GPIO.setup(powerPin, GPIO.OUT)

# read data 
GPIO.output(powerPin, 1)

while True:
    time.sleep(0.1)
    result = instance.read()
    if result.is_valid():
	break

GPIO.output(powerPin, 0)

GPIO.cleanup();

print(str(nodeID) + ',' + str(result.temperature) + ',' + str(result.humidity))
sys.exit(0);