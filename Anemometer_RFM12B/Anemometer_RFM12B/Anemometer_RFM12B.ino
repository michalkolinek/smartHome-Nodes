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

#define nodeID 8      	// RF12 node ID in the range 1-30
#define network 210       	// RF12 Network group
#define freq RF12_868MHZ  	// Frequency of RFM12B module

#define RETRY_PERIOD 1000   // How soon to retry (in ms) if ACK didn't come in
#define RETRY_LIMIT 5     	// Maximum number of times to retry
#define ACK_TIME 10       	// Number of milliseconds to wait for an ack
#define UPDATE_PERIOD 300000 	// 5min
#define MEASURING_PERIOD 10000 	// 10 sec

#define ANEMO_SENSOR_PIN 0
#define ANEMO_POWER_PIN 3

#define RAIN_SENSOR_PIN 7
#define RAIN_POWER_PIN 8

#define LED_POWER_PIN 10


// Data structure for communication
typedef struct {
	int supplyV;		// Supply voltage
    int avg;
    int max;
    int rain;
} Payload;

Payload tx;
const int length = 30;
volatile int anemoCounter;
volatile int rainCounter;
long measuringTimer;
long updateTimer;
int values[length];
int i = 0;
volatile bool p = LOW;

ISR(PCINT0_vect) { 
	// if(digitalRead(RAIN_SENSOR_PIN) == HIGH) {
		rainCounter++;
	// }
}

ISR(PCINT1_vect) { 
	// if(digitalRead(ANEMO_SENSOR_PIN) == HIGH) {
		anemoCounter++;
	// }
}

void setup()
{
	rf12_initialize(nodeID,freq,network);	// Initialize RFM12 with settings defined above
	rf12_control(0xC040);
	rf12_sleep(0);							// Put the RFM12 to sleep
    
    pinMode(ANEMO_SENSOR_PIN, INPUT);
    pinMode(ANEMO_POWER_PIN, OUTPUT);
    digitalWrite(ANEMO_POWER_PIN, HIGH);

    pinMode(RAIN_SENSOR_PIN, INPUT);
    pinMode(RAIN_POWER_PIN, OUTPUT);
    digitalWrite(RAIN_POWER_PIN, HIGH);

    pinMode(LED_POWER_PIN, OUTPUT);
    digitalWrite(LED_POWER_PIN, p);

	ADCSRA &= ~ bit(ADEN); bitSet(PRR, PRADC);
    
    resetValues();
    measuringTimer = millis();
    updateTimer = millis();

    GIMSK = (1<<PCIE0)|(1<<PCIE1);
  	PCMSK1 = (1<<PCINT8);  // ANEMO_SENSOR_PIN
  	PCMSK0 = (1<<PCINT3);  // RAIN_SENSOR_PIN
    sei();
}

void loop()
{
    if(millis() - measuringTimer >= MEASURING_PERIOD) {
    	values[i] = anemoCounter;
    	i++;
      	anemoCounter = 0;
    	measuringTimer = millis();
    }

    if(millis() - updateTimer >= UPDATE_PERIOD) {
    	int sum = 0;
    	int max = 0;
    	for(int j = 0; j < length; j++) {
    		sum += values[j];
    		max = max(max, values[j]);
    	}

    	tx.avg = (int) (sum / length);
    	tx.max = max;
    	tx.rain = rainCounter;
    	tx.supplyV = readVcc();
		rfwrite(); 

		resetValues();
		i = 0;									
		updateTimer = millis();
    }

    Sleepy::loseSomeTime(MEASURING_PERIOD);	
}

void resetValues() {
	for(int j = 0; j < length; j++) {
		values[j] = 0;
	}
	rainCounter = 0;
}


// Send payload data via RF
static void rfwrite()
{
	#ifdef USE_ACK
		// tx and wait for ack up to RETRY_LIMIT times
		for(byte i = 0; i <= RETRY_LIMIT; ++i) {
			rf12_sleep(-1);              // Wake up RF module
			while (!rf12_canSend())
			rf12_recvDone();
			rf12_sendStart(RF12_HDR_ACK, &tx, sizeof tx);
			rf12_sendWait(2);           // Wait for RF to finish sending while in standby mode
			byte acked = waitForAck();  // Wait for ACK
			rf12_sleep(0);              // Put RF module to sleep
			if (acked) {
				return; 				// Return if ACK received
			}

			Sleepy::loseSomeTime(RETRY_PERIOD);     // If no ack received wait and try again
		}
	#else
		rf12_sleep(-1);              // Wake up RF module
		while (!rf12_canSend())
		rf12_recvDone();
		rf12_sendStart(0, &tx, sizeof tx);
		rf12_sendWait(2);           // Wait for RF to finish sending while in standby mode
		rf12_sleep(0);              // Put RF module to sleep
		return;
	#endif
}

// Read battery voltage
long readVcc()
{
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




















