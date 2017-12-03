//----------------------------------------------------------------------------------------------------------------------
// TinyTX - An ATtiny84 and RFM12B Wireless Sensor Node
// By Nathan Chantrell. For hardware design see http://nathan.chantrell.net/tinytx
//
// Detect a normally closed reed switch opening and closing with pin change interrupt to wake from sleep.
//
// Licenced under the Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) licence:
// http://creativecommons.org/licenses/by-sa/3.0/
//
// Requires Arduino IDE with arduino-tiny core: http://code.google.com/p/arduino-tiny/
//----------------------------------------------------------------------------------------------------------------------

#include <JeeLib.h> // https://github.com/jcw/jeelib
#include <PinChangeInterrupt.h> // http://code.google.com/p/arduino-tiny/downloads/list
#include <dht11.h>

#define nodeID 4            // RF12 node ID in the range 1-30
#define network 210         // RF12 Network group
#define freq RF12_868MHZ    // Frequency of RFM12B module

#define USE_ACK           // Enable ACKs, comment out to disable
#define RETRY_PERIOD 5    // How soon to retry (in seconds) if ACK didn't come in
#define RETRY_LIMIT 5     // Maximum number of times to retry
#define ACK_TIME 10       // Number of milliseconds to wait for an ack
#define UPDATE_PERIOD 60000       // Number of milliseconds to wait for an ack

#define SW_PIN 10 // D10
#define LED_PIN 0 // D0

#define DHT11_DATA_PIN 9
#define DHT11_POWER_PIN 8

//########################################################################################################################
//Data Structure to be sent
//########################################################################################################################

dht11 DHT11;

typedef struct {
  int supplyV;    // Supply voltage
  int temp;     // Temperature reading
  int hum;      // Actually humidity reading
  int signal;     // Signal active
} Payload;

Payload tx;

volatile int signal;
volatile int interrupted;

ISR(WDT_vect) { Sleepy::watchdogEvent(); } // interrupt handler for JeeLabs Sleepy power saving

//########################################################################################################################

void setup() {

  rf12_initialize(nodeID,freq,network); // Initialize RFM12 with settings defined above
  rf12_sleep(0);                          // Put the RFM12 to sleep

  signal = 0;
  interrupted = false;

  pinMode(SW_PIN, INPUT);                   //set the pin to input
  digitalWrite(SW_PIN, HIGH);               //use the internal pullup resistor
  attachPcInterrupt(SW_PIN, handleInterrupt, RISING); // attach a PinChange Interrupt on the falling edge

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(DHT11_DATA_PIN, INPUT);
  digitalWrite(DHT11_DATA_PIN, HIGH);
  pinMode(DHT11_POWER_PIN, OUTPUT);
  digitalWrite(DHT11_POWER_PIN, LOW);

  TCCR1A = 0;    // set entire TCCR1A register to 0
  TCCR1B = 0;    // set entire TCCR1A register to 0

  bitSet(TIMSK1, TOIE1);
  TCNT1 = 0;

  // set 1024 prescaler
  bitSet(TCCR1B, CS12);
  bitSet(TCCR1B, CS10);
}

void loop() {

    noInterrupts();
    digitalWrite(LED_PIN, HIGH);
    Sleepy::loseSomeTime(50);
    digitalWrite(LED_PIN, LOW);

  if(interrupted) {
    if(signal >= 3) {
      Sleepy::loseSomeTime(100);
      digitalWrite(LED_PIN, HIGH);
      Sleepy::loseSomeTime(100);
      digitalWrite(LED_PIN, LOW);

      tx.signal = 1;
      tx.temp = NULL;
      tx.hum = NULL;
      tx.supplyV = NULL;
      rfwrite();

      signal = 0;
    }

    interrupted = false;
  } else {
      tx.signal = 0;
      digitalWrite(DHT11_POWER_PIN, HIGH);     // turn DHT11 sensor on
      delay(1000);
      int chk = DHT11.read(DHT11_DATA_PIN);
      if(chk==DHTLIB_OK) {
          tx.temp = DHT11.temperature;
          tx.hum = DHT11.humidity;
      }
      digitalWrite(DHT11_POWER_PIN, LOW);      // turn DHT11 sensor off
      tx.supplyV = readVcc();         // Get supply voltage
      rfwrite();
  }

  interrupts();
  Sleepy::loseSomeTime(UPDATE_PERIOD);
}

void handleInterrupt() {
  signal++;
  interrupted = true;
}

//--------------------------------------------------------------------------------------------------
// Send payload data via RF
//-------------------------------------------------------------------------------------------------
 static void rfwrite() {
  #ifdef USE_ACK
   for (byte i = 0; i <= RETRY_LIMIT; ++i) {  // tx and wait for ack up to RETRY_LIMIT times
     rf12_sleep(-1);              // Wake up RF module
      while (!rf12_canSend())
      rf12_recvDone();
      rf12_sendStart(RF12_HDR_ACK, &tx, sizeof tx);
      rf12_sendWait(2);           // Wait for RF to finish sending while in standby mode
      byte acked = waitForAck();  // Wait for ACK
      rf12_sleep(0);              // Put RF module to sleep
      if (acked) { return; }      // Return if ACK received

   Sleepy::loseSomeTime(RETRY_PERIOD * 1000);     // If no ack received wait and try again
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

// Wait a few milliseconds for proper ACK
 #ifdef USE_ACK
  static byte waitForAck() {
   MilliTimer ackTimer;
   while (!ackTimer.poll(ACK_TIME)) {
     if (rf12_recvDone() && rf12_crc == 0 &&
        rf12_hdr == (RF12_HDR_DST | RF12_HDR_CTL | nodeID))
        return 1;
     }
   return 0;
  }
 #endif

//--------------------------------------------------------------------------------------------------
// Read current supply voltage
//--------------------------------------------------------------------------------------------------
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