#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <Servo.h>

// WiFi credentials
const char* ssid = "POCO F3";
const char* password = "12345678";

// Server details
const char* serverUrl = "http://192.168.85.229:9000";
const int espServerPort = 80;

// Pin definitions (already defined)
const int buttonPin = D6; // GPIO12
const int ledPin = D5;    // GPIO14
const int servoPin1 = D4; // GPIO2 - Servo 1 (Living Room)
const int servoPin2 = D3; // GPIO0 - Servo 2
const int servoPin3 = D7; // GPIO13 - Gas Control Servo
const int servoPin4 = D8; // GPIO15 - Water Tap Servo

// Servo configurations (from existing code)
const int startPosition = 0;    // Initial position
const int targetPosition = 120; // Open position
const int gasTargetPosition = 180; // Gas valve closed position
const int waterTargetPosition = 180; // Water tap closed position
const int delayBetweenSteps = 20; // ms between steps
const int delayAtTarget = 5000;    // 5 seconds hold time

// Global objects
ESP8266WebServer server(espServerPort);
WiFiClient wifiClient;
Servo servo1;
Servo servo2;
Servo gasServo;
Servo waterServo;
bool isButtonPressed = false;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// Function declarations
void handleRoot();
void handleOpenDoor();
void handleLight();
void handleGasControl();
void handleWaterControl();
void openDoor(Servo& servo);
void controlGasValve(bool close);
void controlWaterTap(bool close);
void notifyButtonPress();
void setupWiFi();

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH); // Turn LED on by default
  
  // Initialize servos
  servo1.attach(servoPin1);
  servo2.attach(servoPin2);
  gasServo.attach(servoPin3);
  waterServo.attach(servoPin4);
  servo1.write(startPosition);
  servo2.write(startPosition);
  gasServo.write(startPosition);
  waterServo.write(startPosition);
  
  // Setup WiFi
  setupWiFi();
  
  // Setup HTTP server endpoints
  server.on("/", handleRoot);
  server.on("/open-door", HTTP_POST, handleOpenDoor);
  server.on("/light", HTTP_POST, handleLight);
  server.on("/gas-control", HTTP_POST, handleGasControl);
  server.on("/water-control", HTTP_POST, handleWaterControl);
  server.begin();
  
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();
  
  // Handle button press with debouncing
  int buttonState = digitalRead(buttonPin);
  if (buttonState == LOW) { // Button pressed (active low with pull-up)
    if ((millis() - lastDebounceTime) > debounceDelay) {
      if (!isButtonPressed) {
        isButtonPressed = true;
        notifyButtonPress();
      }
    }
    lastDebounceTime = millis();
  } else {
    isButtonPressed = false;
  }
}

void setupWiFi() {
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void handleRoot() {
  String response = "ESP8266 Control Panel\n";
  response += "IP: " + WiFi.localIP().toString() + "\n";
  response += "Status: Running";
  server.send(200, "text/plain", response);
}

void handleOpenDoor() {
  if (!server.hasArg("door")) {
    server.send(400, "text/plain", "Missing door parameter");
    return;
  }
  
  String door = server.arg("door");
  if (door == "living_room" || door == "front_door") {
    openDoor(servo1);
    server.send(200, "text/plain", "Opening living room door");
  } else if (door == "door2") {
    openDoor(servo2);
    server.send(200, "text/plain", "Opening door 2");
  } else {
    server.send(400, "text/plain", "Invalid door specified");
  }
}

void handleLight() {
  if (!server.hasArg("state")) {
    server.send(400, "text/plain", "Missing state parameter");
    return;
  }
  
  String state = server.arg("state");
  if (state == "on") {
    digitalWrite(ledPin, HIGH);
    server.send(200, "text/plain", "Light turned on");
  } else if (state == "off") {
    digitalWrite(ledPin, LOW);
    server.send(200, "text/plain", "Light turned off");
  } else {
    server.send(400, "text/plain", "Invalid state specified");
  }
}

void handleGasControl() {
  if (!server.hasArg("action")) {
    server.send(400, "text/plain", "Missing action parameter");
    return;
  }
  
  String action = server.arg("action");
  if (action == "close") {
    controlGasValve(true);
    server.send(200, "text/plain", "Closing gas valve");
  } else if (action == "open") {
    controlGasValve(false);
    server.send(200, "text/plain", "Opening gas valve");
  } else {
    server.send(400, "text/plain", "Invalid action specified");
  }
}

void handleWaterControl() {
  if (!server.hasArg("action")) {
    server.send(400, "text/plain", "Missing action parameter");
    return;
  }
  
  String action = server.arg("action");
  if (action == "close") {
    controlWaterTap(true);
    server.send(200, "text/plain", "Closing water tap");
  } else if (action == "open") {
    controlWaterTap(false);
    server.send(200, "text/plain", "Opening water tap");
  } else {
    server.send(400, "text/plain", "Invalid action specified");
  }
}

void openDoor(Servo& servo) {
  // Rotate to open position
  for (int pos = startPosition; pos <= targetPosition; pos += 1) {
    servo.write(pos);
    delay(delayBetweenSteps);
  }
  
  // Hold position
  delay(delayAtTarget);
  
  // Return to closed position
  for (int pos = targetPosition; pos >= startPosition; pos -= 1) {
    servo.write(pos);
    delay(delayBetweenSteps);
  }
}

void controlGasValve(bool close) {
  int targetPos = close ? gasTargetPosition : startPosition;
  int currentPos = gasServo.read();
  
  if (close) {
    // Move from current position to closed position
    for (int pos = currentPos; pos <= targetPos; pos += 1) {
      gasServo.write(pos);
      delay(delayBetweenSteps);
    }
  } else {
    // Move from current position to open position
    for (int pos = currentPos; pos >= targetPos; pos -= 1) {
      gasServo.write(pos);
      delay(delayBetweenSteps);
    }
  }
}

void controlWaterTap(bool close) {
  int targetPos = close ? waterTargetPosition : startPosition;
  int currentPos = waterServo.read();
  
  if (close) {
    // Move from current position to closed position
    for (int pos = currentPos; pos <= targetPos; pos += 1) {
      waterServo.write(pos);
      delay(delayBetweenSteps);
    }
  } else {
    // Move from current position to open position
    for (int pos = currentPos; pos >= targetPos; pos -= 1) {
      waterServo.write(pos);
      delay(delayBetweenSteps);
    }
  }
}

void notifyButtonPress() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String(serverUrl) + "/api/esp/button-pressed";
    
    http.begin(wifiClient, url);  // Use WiFiClient with begin()
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"source\":\"esp8266\",\"timestamp\":\"" + String(millis()) + "\"}";
    int httpCode = http.POST(payload);
    
    if (httpCode > 0) {
      String response = http.getString();
      Serial.println("Server response: " + response);
    } else {
      Serial.println("Error sending button press notification");
    }
    
    http.end();
  }
}

