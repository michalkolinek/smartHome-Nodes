//----------------------------------------------------------------------------------------------------------------------
// TinyTX - An ATtiny84 wireless sensor Node. See http://hardware-libre.fr
//
// Initial hardware design by Nathan Chantrell. See http://nathan.chantrell.net/tinytx
//
// Using the DHT11 temperature/humidity sensor
//
// Licenced under the Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) licence:
// http://creativecommons.org/licenses/by-sa/3.0/
//
// Requires Arduino IDE with arduino-tiny core: http://code.google.com/p/arduino-tiny/
//----------------------------------------------------------------------------------------------------------------------

// ATtiny84 pinout
/*
					 +-\/-+
			   VCC  1|    |14  GND
		  (D0) PB0  2|    |13  AREF (D10)
		  (D1) PB1  3|    |12  PA1 (D9)
			 RESET  4|    |11  PA2 (D8)
INT0  PWM (D2) PB2  5|    |10  PA3 (D7)
	  PWM (D3) PA7  6|    |9   PA4 (D6)
	  PWM (D4) PA6  7|    |8   PA5 (D5) PWM
					 +----+
*/

#include <JeeLib.h> // https://github.com/jcw/jeelib

ISR(WDT_vect) { Sleepy::watchdogEvent(); } // interrupt handler for JeeLabs Sleepy power saving

#define nodeID 5          	// RF12 node ID in the range 1-30
#define network 210       	// RF12 Network group
#define freq RF12_868MHZ  	// Frequency of RFM12B module

#define RETRY_PERIOD 1000   // How soon to retry (in ms) if ACK didn't come in
#define RETRY_LIMIT 5     	// Maximum number of times to retry
#define ACK_TIME 10       	// Number of milliseconds to wait for an ack
#define UPDATE_PERIOD 58000 // Number of milliseconds to wait for next measurement and upload, 2s wait to sensor wakeup

#include <DHT22.h>

#define DHT22_PIN 10     	// DHT sensor is connected on D10/ATtiny pin 13
#define DHT22_POWER 9 		// DHT Power pin is connected on D9/ATtiny pin 12

DHT22 dht(DHT22_PIN);

// Data structure for communication
typedef struct {
	int supplyV;		// Supply voltage
	int temp;			// Temperature reading	  
	int hum;			// Actually humidity reading 
} Payload;

Payload tx;
 

void setup() 
{
	rf12_initialize(nodeID,freq,network);	// Initialize RFM12 with settings defined above 

	rf12_control(0xC040);
	rf12_sleep(0);							// Put the RFM12 to sleep
	// // analogReference(INTERNAL);  			// Set the aref to the internal 1.1V reference
	pinMode(DHT22_POWER, OUTPUT); 			// set power pin for DHT11 to output
	// dht.begin();
	PRR = bit(PRTIM1); // only keep timer 0 going
  	ADCSRA &= ~ bit(ADEN); bitSet(PRR, PRADC); // Disable the ADC to save power
}

void loop() 
{
	DHT22_ERROR_t errorCode;

	digitalWrite(DHT22_POWER, HIGH); 			// turn DHT sensor on
	Sleepy::loseSomeTime(2000); // Sensor requires minimum 2s warm-up after power-on.
	
	errorCode = dht.readData();
	if(errorCode == DHT_ERROR_NONE) {
		tx.temp = dht.getTemperatureCInt();
		tx.hum = dht.getHumidityInt();
	}
	
	digitalWrite(DHT22_POWER, LOW); 			// turn DHT11 sensor off

	tx.supplyV = readVcc(); 				// Get supply voltage

	rfwrite(); 

	Sleepy::loseSomeTime(UPDATE_PERIOD); 			// enter low power mode for 60 seconds (valid range 16-65000 ms)
}


// Send payload data via RF
static void rfwrite()
{


		rf12_sleep(-1);              // Wake up RF module
		while (!rf12_canSend())
		rf12_recvDone();
		rf12_sendStart(0, &tx, sizeof tx); 
		rf12_sendWait(2);           // Wait for RF to finish sending while in standby mode
		rf12_sleep(0);              // Put RF module to sleep
		return;

}

// Read battery voltage
long readVcc() {
	bitClear(PRR, PRADC); ADCSRA |= bit(ADEN); // Enable the ADC
	long result;
	// Read 1.1V reference against Vcc
	#if defined(__AVR_ATtiny84__) 
	ADMUX = _BV(MUX5) | _BV(MUX0); // For ATtiny84
	#else
	ADMUX = _BV(REFS0) | _BV(MUX3) | _BV(MUX2) | _BV(MUX1);  // For ATmega328
	#endif 
	delay(2); // Wait for Vref to settle
	ADCSRA |= _BV(ADSC); // Convert
	while (bit_is_set(ADCSRA,ADSC));
	result = ADCL;
	result |= ADCH<<8;
	result = 1126400L / result; // Back-calculate Vcc in mV
	ADCSRA &= ~ bit(ADEN); bitSet(PRR, PRADC); // Disable the ADC to save power
	return result;
}

// Wait a few milliseconds for proper ACK
static byte waitForAck() 
{
	MilliTimer ackTimer;
	while(!ackTimer.poll(ACK_TIME)) {
   		if(rf12_recvDone() && rf12_crc == 0 && rf12_hdr == (RF12_HDR_DST | RF12_HDR_CTL | nodeID)) {
   			return 1;
   		}	  	
   	}
 	return 0;
}



