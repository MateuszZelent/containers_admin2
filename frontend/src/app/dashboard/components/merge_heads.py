import os
import subprocess
import sys

def main():
    # Get current heads
    print("Checking current migration heads...")
    result = subprocess.run(['alembic', 'heads'], capture_output=True, text=True)
    
    if result.returncode != 0:
        print("Error getting heads:", result.stderr)
        sys.exit(1)
        
    heads = [line.split(' ')[0] for line in result.stdout.strip().split('\n') if line]
    print(f"Found {len(heads)} heads: {', '.join(heads)}")
    
    if len(heads) <= 1:
        print("No multiple heads found or already merged.")
        return
        
    # Create merge migration
    print("Creating merge migration...")
    merge_cmd = ['alembic', 'merge', '-m', "merge_heads"] + heads
    result = subprocess.run(merge_cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print("Error creating merge migration:", result.stderr)
        sys.exit(1)
        
    print("Merge migration created successfully.")
    
    # Upgrade to new merged head
    print("Applying migration to merged head...")
    result = subprocess.run(['alembic', 'upgrade', 'head'], capture_output=True, text=True)
    
    if result.returncode != 0:
        print("Error upgrading to merged head:", result.stderr)
        sys.exit(1)
        
    print("Database upgraded successfully to merged head.")

if __name__ == "__main__":
    main()
