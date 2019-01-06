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

#define nodeID 8         	// RF12 node ID in the range 1-30
#define network 210       	// RF12 Network group
#define freq RF12_868MHZ  	// Frequency of RFM12B module
#define baseNodeID 25		// RF12 base node ID

#define RETRY_PERIOD 700   	// How soon to retry (in ms) if ACK didn't come in
#define RETRY_LIMIT 5     	// Maximum number of times to retry
#define ACK_TIME 10       	// Number of milliseconds to wait for an ack
#define CONTROLLER_PIN 0    // Relay connected on pin 0
#define LED_PIN 8      		// LED connected on pin 8
#define UPDATE_PERIOD 60  	// period in seconds to report status

// #define SENSOR_POWER_PIN 9
// #define SENSOR_DATA_PIN A0

// Data structure for receiving commands
typedef struct {
	int senderID;
	int command;
	int param;
} PayloadRx;

PayloadRx rx;

// Data structure for sending status
typedef struct {
	int supplyV;
	int status;
} PayloadTx;

PayloadTx tx;

int status;
int counter;

void setup()
{
	rf12_initialize(nodeID,freq,network);	// Initialize RFM12 with settings defined above
	rf12_control(0xC040);
	analogReference(INTERNAL);  			// Set the aref to the internal 1.1V reference
	pinMode(CONTROLLER_PIN, OUTPUT); 		// set power pin for relay control
	pinMode(LED_PIN, OUTPUT); 				// set power pin for LED
	// pinMode(SENSOR_POWER_PIN, OUTPUT); 		// set power pin for sensor
	status = 0;
	counter = 0;
}

void loop()
{
	if (rf12_recvDone() && rf12_crc == 0 && (rf12_hdr & RF12_HDR_CTL) == 0) {
		rx = *(PayloadRx*) rf12_data;

		// messages from base node only
		// if(baseNodeID == rx.senderID && (rx.targetID == nodeID || rx.targetID == 255)) {
		if(baseNodeID == rx.senderID) {

			blick(2, 100);


		}

		// message from other node or to other node, ignore
		else {
			blick(rx.senderID, 100);
		}

		delay(500);

		blick(1, 500);

		delay(500);
	}

	// if(counter == UPDATE_PERIOD) {
	// 	counter = 0;

	// 	tx.supplyV = readVcc();

	// 	// set relay status
	// 	tx.status = 1;

	// 	rfwrite();
	// 	blick(3, 100);
	// }

	// counter++;

	// delay(100);
}

void blick(int count, int duration)
{
	for(int i = 0; i<count; i++) {
		digitalWrite(LED_PIN, HIGH); // turn on
		delay(duration);
		digitalWrite(LED_PIN, LOW); // turn off
		delay(duration);
	}
	return;
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



