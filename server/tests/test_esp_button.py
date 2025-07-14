#!/usr/bin/env python3
"""
Simple ESP8266 Button Test Script
Direct test for pushing buttons on ESP8266
"""

import requests
import time
import json

def test_esp_button_control():
    """Test ESP8266 button control directly"""
    
    # ESP8266 configuration
    esp_ip = "192.168.85.90"
    base_url = f"http://{esp_ip}"
    
    endpoints = {
        'lights_on': '/lights/on',
        'lights_off': '/lights/off',
        'status': '/lights/status'
    }
    
    print("🔌 ESP8266 Button Control Test")
    print("=" * 40)
    print(f"📡 ESP IP: {esp_ip}")
    print(f"🌐 Base URL: {base_url}")
    print()
    
    # Test sequence
    tests = [
        {'action': 'status', 'endpoint': endpoints['status'], 'method': 'GET', 'description': 'Check current status'},
        {'action': 'on', 'endpoint': endpoints['lights_on'], 'method': 'POST', 'description': 'Turn lights ON'},
        {'action': 'status', 'endpoint': endpoints['status'], 'method': 'GET', 'description': 'Check status after ON'},
        {'action': 'off', 'endpoint': endpoints['lights_off'], 'method': 'POST', 'description': 'Turn lights OFF'},
        {'action': 'status', 'endpoint': endpoints['status'], 'method': 'GET', 'description': 'Check status after OFF'},
    ]
    
    for i, test in enumerate(tests, 1):
        print(f"🧪 Test {i}: {test['description']}")
        print(f"   📤 {test['method']} {base_url}{test['endpoint']}")
        
        try:
            if test['method'] == 'GET':
                response = requests.get(f"{base_url}{test['endpoint']}", timeout=10)
            else:
                response = requests.post(f"{base_url}{test['endpoint']}", timeout=10)
            
            print(f"   📈 Status Code: {response.status_code}")
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    print(f"   📄 Response: {json.dumps(data, indent=2)}")
                except:
                    print(f"   📄 Response: {response.text}")
                print("   ✅ SUCCESS")
            else:
                print(f"   ❌ FAILED - Status: {response.status_code}")
                print(f"   📄 Response: {response.text}")
                
        except requests.exceptions.Timeout:
            print("   ⏰ TIMEOUT - ESP8266 not responding")
        except requests.exceptions.ConnectionError:
            print("   🔌 CONNECTION ERROR - Cannot reach ESP8266")
        except Exception as e:
            print(f"   💥 ERROR: {e}")
        
        print()
        
        # Add delay between requests
        if i < len(tests):
            print("   ⏳ Waiting 2 seconds...")
            time.sleep(2)
    
    print("🏁 ESP8266 Button Test Completed!")

def test_specific_endpoints():
    """Test specific endpoints with custom payloads"""
    
    esp_ip = "192.168.1.100"
    base_url = f"http://{esp_ip}"
    
    print("\n🎯 Testing Specific Endpoints")
    print("=" * 30)
    
    # Test with room parameter
    rooms = ['living_room', 'bedroom', 'kitchen', 'all']
    
    for room in rooms:
        print(f"\n🏠 Testing room: {room}")
        
        # Turn on lights for specific room
        try:
            payload = {'room': room} if room != 'all' else {}
            response = requests.post(f"{base_url}/lights/on", json=payload, timeout=5)
            print(f"   🔆 Turn ON - Status: {response.status_code}")
            if response.status_code == 200:
                print(f"   📄 Response: {response.text}")
            
            time.sleep(1)
            
            # Turn off lights for specific room
            response = requests.post(f"{base_url}/lights/off", json=payload, timeout=5)
            print(f"   🌙 Turn OFF - Status: {response.status_code}")
            if response.status_code == 200:
                print(f"   📄 Response: {response.text}")
                
        except Exception as e:
            print(f"   ❌ Error testing {room}: {e}")
        
        time.sleep(1)

if __name__ == "__main__":
    print("🚀 Starting ESP8266 Button Tests...")
    print()
    
    try:
        # Run basic button tests
        test_esp_button_control()
        
        # Run specific endpoint tests
        test_specific_endpoints()
        
    except KeyboardInterrupt:
        print("\n\n⛔ Test interrupted by user")
    except Exception as e:
        print(f"\n💥 Unexpected error: {e}")
    
    print("\n👋 Test completed!") 