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

#define nodeID 3          	// RF12 node ID in the range 1-30
#define network 210       	// RF12 Network group
#define freq RF12_868MHZ  	// Frequency of RFM12B module
#define baseNodeID 25

#define OUTPUT_PIN 9      	// Relay connected on pin 9
#define LED_PIN 10      	// LED connected on pin 10

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

void setup() 
{
	rf12_initialize(nodeID,freq,network);	// Initialize RFM12 with settings defined above 
	rf12_control(0xC040);
	analogReference(INTERNAL);  			// Set the aref to the internal 1.1V reference
	pinMode(OUTPUT_PIN, OUTPUT); 			// set power pin for DHT11 to output
	status = 0;
}

void loop() 
{
	if (rf12_recvDone() && rf12_crc == 0 && (rf12_hdr & RF12_HDR_CTL) == 0) {
		rx = *(PayloadRx*) rf12_data;
	
		// messages from base node only
		if(baseNodeID == rx.senderID) {		

			// test - blick as many times as rx.param says
			if(rx.command == 1) {
				blick(rx.param, 100);
			} 

			// get status and measure supply V, then send it to the base
			else if(rx.command == 2) {
				tx.supplyV = readVcc();
				tx.status = status;
				rfwrite();
			} 

			// control output
			else if(rx.command == 3) {

				if(rx.param == 1) {
					blick(1, 100);
					status = 1;
					digitalWrite(OUTPUT_PIN, HIGH); // turn on
				}

				if(rx.param == 0) {
					digitalWrite(OUTPUT_PIN, LOW); // turn off
					status = 0;
					blick(2, 100);
				}
			}	        
		}

		// message from other node, ignore
		else {
			// blick(1, 100);
		}
	}
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
	rf12_sleep(-1);              // Wake up RF module
	while (!rf12_canSend())
	rf12_recvDone();
	rf12_sendStart(0, &tx, sizeof tx); 
	rf12_sendWait(2);           // Wait for RF to finish sending while in standby mode
	rf12_sleep(0);              // Put RF module to sleep
	return;
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

