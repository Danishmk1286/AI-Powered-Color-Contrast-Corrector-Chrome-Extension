#!/usr/bin/env python3
"""
Test script for AI Contrast Assistant API
Tests all endpoints and verifies model predictions
"""

import requests
import json
import time
import sys
import os

# API base URL
BASE_URL = "http://127.0.0.1:5000"

# Check if we're on Windows and handle emoji encoding
IS_WINDOWS = sys.platform == 'win32'

def safe_print(text):
    """Print text with emoji fallback for Windows"""
    if IS_WINDOWS:
        # Replace emojis with ASCII alternatives for Windows
        text = text.replace('🧪', '[TEST]')
        text = text.replace('✅', '[OK]')
        text = text.replace('❌', '[FAIL]')
        text = text.replace('⚠️', '[WARN]')
        text = text.replace('🔍', '[CHECK]')
        text = text.replace('🔮', '[PREDICT]')
        text = text.replace('⚡', '[PERF]')
        text = text.replace('🛡️', '[ERROR]')
        text = text.replace('📊', '[STATS]')
        text = text.replace('🎉', '[SUCCESS]')
    print(text)

def test_health_check():
    """Test the health check endpoint"""
    safe_print("🔍 Testing health check endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/")
        if response.status_code == 200:
            data = response.json()
            safe_print(f"✅ Health check passed:")
            print(f"   Status: {data.get('status')}")
            print(f"   Message: {data.get('message')}")
            print(f"   Model Type: {data.get('model_type')}")
            print(f"   Model Features: {data.get('model_features')}")
            return True
        else:
            safe_print(f"❌ Health check failed: HTTP {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        safe_print("❌ Cannot connect to API. Is the server running?")
        return False
    except Exception as e:
        safe_print(f"❌ Health check error: {e}")
        return False

def test_predict_endpoint():
    """Test the predict endpoint with various test cases"""
    safe_print("\n🔮 Testing predict endpoint...")
    
    test_cases = [
        {
            "name": "High Contrast (White on Black)",
            "data": {
                "fg": [255, 255, 255],
                "bg": [0, 0, 0],
                "contrast_ratio": 21.0,
                "element_type": "button",
                "font_size": 16,
                "font_weight": 400,
                "user_scale": 0.5
            },
            "expected_comfortable": True
        },
        {
            "name": "Low Contrast (Light Gray on White)",
            "data": {
                "fg": [200, 200, 200],
                "bg": [255, 255, 255],
                "contrast_ratio": 1.5,
                "element_type": "p",
                "font_size": 14,
                "font_weight": 400,
                "user_scale": 0.5
            },
            "expected_comfortable": False
        },
        {
            "name": "Medium Contrast (Button)",
            "data": {
                "fg": [255, 255, 255],
                "bg": [255, 183, 0],
                "contrast_ratio": 1.75,
                "element_type": "button",
                "font_size": 16,
                "font_weight": 600,
                "user_scale": 0.5
            },
            "expected_comfortable": False
        },
        {
            "name": "WCAG AA Compliant",
            "data": {
                "fg": [0, 0, 0],
                "bg": [255, 255, 255],
                "contrast_ratio": 21.0,
                "element_type": "p",
                "font_size": 16,
                "font_weight": 400,
                "user_scale": 0.5
            },
            "expected_comfortable": True
        },
        {
            "name": "Heading with Large Font",
            "data": {
                "fg": [100, 100, 100],
                "bg": [255, 255, 255],
                "contrast_ratio": 4.2,
                "element_type": "h1",
                "font_size": 32,
                "font_weight": 700,
                "user_scale": 0.5
            },
            "expected_comfortable": None  # Model will decide
        }
    ]
    
    passed = 0
    failed = 0
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n  Test {i}: {test_case['name']}")
        try:
            response = requests.post(
                f"{BASE_URL}/predict",
                json=test_case['data'],
                headers={"Content-Type": "application/json"},
                timeout=5
            )
            
            if response.status_code == 200:
                result = response.json()
                comfortable = result.get('comfortable')
                comfort_score = result.get('comfort_score')
                
                safe_print(f"    ✅ Prediction received:")
                print(f"       Comfortable: {comfortable}")
                print(f"       Comfort Score: {comfort_score}")
                print(f"       Element Type: {result.get('element_type')}")
                
                # Verify expected result if provided
                if test_case['expected_comfortable'] is not None:
                    if comfortable == test_case['expected_comfortable']:
                        safe_print(f"    ✅ Expected result matches")
                        passed += 1
                    else:
                        safe_print(f"    ⚠️  Expected {test_case['expected_comfortable']}, got {comfortable}")
                        failed += 1
                else:
                    safe_print(f"    ✅ Prediction received (no expected value)")
                    passed += 1
            else:
                safe_print(f"    ❌ Request failed: HTTP {response.status_code}")
                print(f"       Response: {response.text}")
                failed += 1
                
        except requests.exceptions.Timeout:
            safe_print(f"    ❌ Request timed out")
            failed += 1
        except Exception as e:
            safe_print(f"    ❌ Error: {e}")
            failed += 1
        
        # Small delay between requests
        time.sleep(0.1)
    
    safe_print(f"\n📊 Test Results: {passed} passed, {failed} failed")
    return failed == 0

def test_error_handling():
    """Test error handling with invalid inputs"""
    safe_print("\n🛡️  Testing error handling...")
    
    error_cases = [
        {
            "name": "Missing required fields",
            "data": {},
            "should_fail": True
        },
        {
            "name": "Invalid contrast ratio",
            "data": {
                "fg": [255, 255, 255],
                "bg": [0, 0, 0],
                "contrast_ratio": "invalid",
                "element_type": "button"
            },
            "should_fail": True
        },
        {
            "name": "Invalid color values",
            "data": {
                "fg": [300, 300, 300],  # Out of range
                "bg": [0, 0, 0],
                "contrast_ratio": 10.0
            },
            "should_fail": False  # API should handle gracefully
        }
    ]
    
    for test_case in error_cases:
        print(f"  Testing: {test_case['name']}")
        try:
            response = requests.post(
                f"{BASE_URL}/predict",
                json=test_case['data'],
                headers={"Content-Type": "application/json"},
                timeout=5
            )
            
            if test_case['should_fail']:
                if response.status_code >= 400:
                    safe_print(f"    ✅ Correctly returned error: HTTP {response.status_code}")
                else:
                    safe_print(f"    ⚠️  Expected error but got: HTTP {response.status_code}")
            else:
                if response.status_code == 200:
                    safe_print(f"    ✅ Handled gracefully: HTTP {response.status_code}")
                else:
                    safe_print(f"    ⚠️  Unexpected error: HTTP {response.status_code}")
        except Exception as e:
            safe_print(f"    ⚠️  Exception: {e}")
    
    return True

def test_performance():
    """Test API performance with multiple requests"""
    safe_print("\n⚡ Testing performance...")
    
    test_data = {
        "fg": [255, 255, 255],
        "bg": [0, 0, 0],
        "contrast_ratio": 21.0,
        "element_type": "button",
        "font_size": 16,
        "font_weight": 400,
        "user_scale": 0.5
    }
    
    num_requests = 10
    times = []
    
    safe_print(f"  Sending {num_requests} requests...")
    for i in range(num_requests):
        start = time.time()
        try:
            response = requests.post(
                f"{BASE_URL}/predict",
                json=test_data,
                headers={"Content-Type": "application/json"},
                timeout=5
            )
            elapsed = time.time() - start
            times.append(elapsed)
            if response.status_code == 200:
                safe_print(f"    Request {i+1}: {elapsed*1000:.2f}ms ✅")
            else:
                safe_print(f"    Request {i+1}: Failed ❌")
        except Exception as e:
            safe_print(f"    Request {i+1}: Error - {e}")
    
    if times:
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        safe_print(f"\n  📊 Performance Statistics:")
        print(f"     Average: {avg_time*1000:.2f}ms")
        print(f"     Min: {min_time*1000:.2f}ms")
        print(f"     Max: {max_time*1000:.2f}ms")
        
        if avg_time < 0.1:
            safe_print(f"  ✅ Performance: Excellent (<100ms)")
        elif avg_time < 0.5:
            safe_print(f"  ✅ Performance: Good (<500ms)")
        else:
            safe_print(f"  ⚠️  Performance: Slow (>500ms)")
    
    return True

def main():
    """Run all tests"""
    print("=" * 60)
    safe_print("🧪 AI Contrast Assistant API Test Suite")
    print("=" * 60)
    print()
    
    # Test health check
    health_ok = test_health_check()
    
    if not health_ok:
        safe_print("\n❌ Health check failed. Please start the API server first.")
        print("   Run: cd api && python app.py")
        return
    
    # Test predict endpoint
    predict_ok = test_predict_endpoint()
    
    # Test error handling
    test_error_handling()
    
    # Test performance
    test_performance()
    
    # Summary
    print("\n" + "=" * 60)
    safe_print("📊 Test Summary")
    print("=" * 60)
    status_health = 'PASSED' if health_ok else 'FAILED'
    status_predict = 'PASSED' if predict_ok else 'FAILED'
    print(f"Health Check: {status_health}")
    print(f"Predict Endpoint: {status_predict}")
    
    if health_ok and predict_ok:
        safe_print("\n🎉 All critical tests passed!")
    else:
        safe_print("\n⚠️  Some tests failed. Please check the output above.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        safe_print("\n\n⚠️  Tests interrupted by user")
    except Exception as e:
        safe_print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()

