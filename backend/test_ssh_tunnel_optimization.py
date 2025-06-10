#!/usr/bin/env python3
"""
Test script for SSH Tunnel Service optimization.
This script demonstrates the new health check and PID tracking functionality.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from app.db.session import get_db
from app.services.ssh_tunnel import SSHTunnelService, HealthStatus
from app.db.models import SSHTunnel, Job
from app.core.logging import cluster_logger


async def test_health_check():
    """Test the health check functionality."""
    print("🔍 Testing SSH Tunnel Health Check functionality...")

    # Get database session
    db = next(get_db())

    try:
        # Initialize tunnel service
        tunnel_service = SSHTunnelService(db)

        # Get all active tunnels
        active_tunnels = db.query(SSHTunnel).filter(SSHTunnel.status == "ACTIVE").all()

        if not active_tunnels:
            print("❌ No active tunnels found for testing")
            return

        print(f"✅ Found {len(active_tunnels)} active tunnels")

        # Test health check on first tunnel
        tunnel = active_tunnels[0]
        print(f"\n🏥 Testing health check for tunnel {tunnel.id}...")

        health_info = await tunnel_service.health_check(tunnel.id)

        print(f"   Status: {health_info.status.value}")
        print(f"   Port connectivity: {health_info.port_connectivity}")
        print(f"   Last check: {health_info.last_check}")

        if health_info.ssh_process:
            print(f"   SSH Process (PID: {health_info.ssh_process.pid})")
            print(f"     Running: {health_info.ssh_process.is_running}")
            print(f"     Memory: {health_info.ssh_process.memory_usage:.1f} MB")
            print(f"     CPU: {health_info.ssh_process.cpu_usage:.1f}%")
        else:
            print("   SSH Process: Not found")

        if health_info.socat_process:
            print(f"   Socat Process (PID: {health_info.socat_process.pid})")
            print(f"     Running: {health_info.socat_process.is_running}")
            print(f"     Memory: {health_info.socat_process.memory_usage:.1f} MB")
            print(f"     CPU: {health_info.socat_process.cpu_usage:.1f}%")
        else:
            print("   Socat Process: Not found")

        if health_info.error_message:
            print(f"   Error: {health_info.error_message}")

        # Test health check for all tunnels
        print(f"\n🌐 Testing health check for all active tunnels...")

        health_results = await tunnel_service.health_check_all_active_tunnels()

        print(f"✅ Checked {len(health_results)} tunnels")

        healthy_count = sum(
            1 for h in health_results.values() if h.status == HealthStatus.HEALTHY
        )
        unhealthy_count = sum(
            1 for h in health_results.values() if h.status == HealthStatus.UNHEALTHY
        )
        unknown_count = sum(
            1 for h in health_results.values() if h.status == HealthStatus.UNKNOWN
        )

        print(f"   Healthy: {healthy_count}")
        print(f"   Unhealthy: {unhealthy_count}")
        print(f"   Unknown: {unknown_count}")

        print("\n✅ Health check testing completed successfully!")

    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        cluster_logger.error(f"Test error: {str(e)}")

    finally:
        db.close()


async def test_tunnel_creation():
    """Test tunnel creation with PID tracking."""
    print("\n🔧 Testing tunnel creation with PID tracking...")

    db = next(get_db())

    try:
        # Find a job that could use a tunnel
        job = (
            db.query(Job)
            .filter(Job.status == "RUNNING", Job.port.isnot(None), Job.node.isnot(None))
            .first()
        )

        if not job:
            print("❌ No suitable running job found for tunnel creation test")
            return

        print(f"✅ Found job {job.id} for testing")
        print(f"   Job port: {job.port}")
        print(f"   Job node: {job.node}")

        tunnel_service = SSHTunnelService(db)

        # Create tunnel
        print("🚇 Creating tunnel...")
        tunnel_info = await tunnel_service.create_tunnel(job)

        if tunnel_info:
            print(f"✅ Tunnel created successfully!")
            print(f"   Tunnel ID: {tunnel_info.id}")
            print(f"   Local port: {tunnel_info.local_port}")
            print(f"   Remote port: {tunnel_info.remote_port}")

            # Get tunnel from database to check PID fields
            tunnel = db.query(SSHTunnel).filter(SSHTunnel.id == tunnel_info.id).first()

            if tunnel:
                print(f"   SSH PID: {tunnel.ssh_pid}")
                print(f"   Socat PID: {tunnel.socat_pid}")
                print(f"   Health status: {tunnel.health_status}")
                print(f"   Last health check: {tunnel.last_health_check}")

            # Test health check on the new tunnel
            print("🏥 Performing health check on new tunnel...")
            health_info = await tunnel_service.health_check(tunnel_info.id)
            print(f"   Health status: {health_info.status.value}")

            # Clean up - close the tunnel
            print("🧹 Cleaning up test tunnel...")
            await tunnel_service.close_tunnel(tunnel_info.id)
            print("✅ Test tunnel closed")

        else:
            print("❌ Failed to create tunnel")

    except Exception as e:
        print(f"❌ Error during tunnel creation test: {str(e)}")
        cluster_logger.error(f"Tunnel creation test error: {str(e)}")

    finally:
        db.close()


async def main():
    """Main test function."""
    print("🚀 Starting SSH Tunnel Service Optimization Tests")
    print("=" * 60)

    try:
        await test_health_check()
        await test_tunnel_creation()

        print("\n" + "=" * 60)
        print("🎉 All tests completed!")

    except Exception as e:
        print(f"\n❌ Critical error during testing: {str(e)}")
        return 1

    return 0


if __name__ == "__main__":
    # Run the tests
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
