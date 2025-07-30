#!/usr/bin/env python3
"""
BitChat Web UI Launcher
Simple launcher script for the BitChat Web UI
"""

import sys
import subprocess
import os
from pathlib import Path

def check_requirements():
    """Check if required packages are installed"""
    required_packages = [
        'flask',
        'flask_socketio',
        'bleak',
        'aioconsole',
        'pybloom_live'
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing.append(package)
    
    if missing:
        print(f"❌ Missing required packages: {', '.join(missing)}")
        print("Please install requirements with:")
        print("pip install -r requirements-web.txt")
        return False
    
    return True

def main():
    """Main launcher function"""
    print("🚀 BitChat Web UI Launcher")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not Path('bitchat.py').exists():
        print("❌ Error: Please run this script from the BitChat directory")
        print("   (the directory containing bitchat.py)")
        sys.exit(1)
    
    # Check requirements
    if not check_requirements():
        sys.exit(1)
    
    print("✅ All requirements satisfied")
    print("🌐 Starting BitChat Web UI...")
    print()
    
    # Parse command line arguments
    port = 5000
    host = '0.0.0.0'
    debug = False
    
    if '--port' in sys.argv:
        try:
            port_idx = sys.argv.index('--port')
            port = int(sys.argv[port_idx + 1])
        except (ValueError, IndexError):
            print("❌ Error: Invalid port number")
            sys.exit(1)
    
    if '--host' in sys.argv:
        try:
            host_idx = sys.argv.index('--host')
            host = sys.argv[host_idx + 1]
        except IndexError:
            print("❌ Error: Host argument missing")
            sys.exit(1)
    
    if '--debug' in sys.argv:
        debug = True
    
    if '--help' in sys.argv or '-h' in sys.argv:
        print("BitChat Web UI Launcher")
        print()
        print("Usage: python launcher.py [options]")
        print()
        print("Options:")
        print("  --host HOST    Host to bind to (default: 0.0.0.0)")
        print("  --port PORT    Port to bind to (default: 5000)")
        print("  --debug        Enable debug mode")
        print("  --help, -h     Show this help message")
        print()
        print("Examples:")
        print("  python launcher.py")
        print("  python launcher.py --port 8080")
        print("  python launcher.py --host localhost --port 3000")
        print("  python launcher.py --debug")
        return
    
    print(f"📡 Server will be available at:")
    print(f"   Local:   http://localhost:{port}")
    if host != 'localhost' and host != '127.0.0.1':
        print(f"   Network: http://{host}:{port}")
    print()
    print("💡 Tips:")
    print("   - Open the URL in your web browser")
    print("   - Make sure your Bluetooth adapter is enabled")
    print("   - The terminal will show connection logs")
    print("   - Press Ctrl+C to stop the server")
    print()
    
    try:
        # Start the web UI
        from web_ui import WebBitchatClient
        
        client = WebBitchatClient()
        client.start(host=host, port=port, debug=debug)
        
    except KeyboardInterrupt:
        print("\n👋 BitChat Web UI stopped")
    except Exception as e:
        print(f"❌ Error starting web UI: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
