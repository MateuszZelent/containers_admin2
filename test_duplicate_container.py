#!/usr/bin/env python3
"""
Test script to verify duplicate container name detection works correctly.
This script will test the backend API directly.
"""

import asyncio
import sys
import requests
import pytest

pytest.skip("Manual integration test", allow_module_level=True)

# Add the backend directory to Python path
sys.path.insert(0, '/home/kkingstoun/git/containers_admin2/backend')

# Test configuration
BACKEND_URL = "http://localhost:8000"
TEST_USER_ID = "test_user_123"
TEST_JOB_NAME = "duplicate_test_job"


async def test_duplicate_container_detection():
    """Test that duplicate container names are properly rejected."""
    
    print("🧪 Testing duplicate container name detection...")
    
    # Test job data
    job_data = {
        "job_name": TEST_JOB_NAME,
        "template_name": "manga",  # assuming this template exists
        "num_cpus": 1,
        "memory_gb": 1,
        "num_gpus": 0,
        "time_limit": "01:00:00",
        "preview": False
    }
    
    headers = {
        "Content-Type": "application/json",
        "User-ID": TEST_USER_ID  # Simulate authenticated user
    }
    
    try:
        # First job submission - should succeed
        print(f"📤 Submitting first job with name: {TEST_JOB_NAME}")
        response1 = requests.post(
            f"{BACKEND_URL}/jobs/", json=job_data, headers=headers
        )
        
        if response1.status_code == 201:
            print("✅ First job created successfully")
            job_id = response1.json().get("job_id")
            print(f"   Job ID: {job_id}")
        else:
            print(f"❌ First job creation failed: "
                  f"{response1.status_code} - {response1.text}")
            return False
            
        # Second job submission with same name - should fail
        print(f"📤 Submitting second job with same name: {TEST_JOB_NAME}")
        response2 = requests.post(
            f"{BACKEND_URL}/jobs/", json=job_data, headers=headers
        )
        
        if response2.status_code == 400:
            error_detail = response2.json().get("detail", "")
            print("✅ Second job correctly rejected!")
            print(f"   Error message: {error_detail}")
            
            # Check if error message is user-friendly
            if ("already exists" in error_detail and
                    TEST_JOB_NAME in error_detail):
                print("✅ Error message is clear and informative")
                return True
            else:
                print(f"⚠️  Error message could be more specific: "
                      f"{error_detail}")
                return False
        else:
            print(f"❌ Second job should have been rejected but got: "
                  f"{response2.status_code} - {response2.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend. "
              "Make sure it's running on http://localhost:8000")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False


def check_backend_running():
    """Check if backend is running."""
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        return response.status_code == 200
    except Exception:
        return False


if __name__ == "__main__":
    print("🚀 Starting duplicate container name test...\n")
    
    # Check if backend is running
    if not check_backend_running():
        print("❌ Backend is not running. Please start it first:")
        print("   cd backend && python main.py")
        sys.exit(1)
    
    # Run the test
    success = asyncio.run(test_duplicate_container_detection())
    
    if success:
        print("\n🎉 All tests passed! "
              "Duplicate container detection is working correctly.")
        sys.exit(0)
    else:
        print("\n❌ Test failed. Please check the implementation.")
        sys.exit(1)
