#!/usr/bin/env python3
"""
BitChat Web UI - A modern web interface for the BitChat BLE mesh chat system
"""

import asyncio
import json
import threading
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, asdict
from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import queue
import signal
import sys

# Import BitChat components
from bitchat import BitchatClient, Peer, ChatContext, ChatMode, Public, Channel, PrivateDM
from terminal_ux import format_message_display

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class WebMessage:
    """Message format for web interface"""
    id: str
    content: str
    sender: str
    sender_id: str
    timestamp: str
    is_private: bool
    is_channel: bool
    channel: Optional[str] = None
    recipient: Optional[str] = None
    is_encrypted: bool = False
    is_own: bool = False

@dataclass
class WebPeer:
    """Peer format for web interface"""
    id: str
    nickname: str
    is_online: bool
    last_seen: Optional[str] = None
    fingerprint: Optional[str] = None

@dataclass
class WebChannel:
    """Channel format for web interface"""
    name: str
    is_joined: bool
    is_protected: bool
    has_key: bool
    member_count: int
    owner: Optional[str] = None

class WebBitchatClient:
    """Web wrapper for BitchatClient"""
    
    def __init__(self):
        self.bitchat = BitchatClient()
        self.app = Flask(__name__, template_folder='templates', static_folder='static')
        self.app.secret_key = 'bitchat-web-ui-secret'
        self.socketio = SocketIO(self.app, cors_allowed_origins="*", async_mode='threading')
        
        # Web-specific state
        self.messages: List[WebMessage] = []
        self.message_queue = queue.Queue()
        self.running = False
        self.bitchat_thread = None
        self.connection_status = "disconnected"
        self.session_id = str(uuid.uuid4())
        
        # Setup routes and socket handlers
        self.setup_routes()
        self.setup_socket_handlers()
        
        # Override BitChat message display to capture for web
        self.original_display_message = self.bitchat.display_message
        self.bitchat.display_message = self.web_display_message
        
        # Override connection status callbacks
        self.bitchat.handle_disconnect = self.web_handle_disconnect
    
    def setup_routes(self):
        """Setup Flask routes"""
        
        @self.app.route('/')
        def index():
            return render_template('index.html')
        
        @self.app.route('/api/status')
        def status():
            return jsonify({
                'connected': self.connection_status == "connected",
                'nickname': self.bitchat.nickname,
                'peer_id': self.bitchat.my_peer_id,
                'peer_count': len(self.bitchat.peers),
                'session_count': self.bitchat.encryption_service.get_session_count(),
                'current_mode': self.get_current_mode_info()
            })
        
        @self.app.route('/api/peers')
        def get_peers():
            peers = []
            for peer_id, peer in self.bitchat.peers.items():
                fingerprint = self.bitchat.encryption_service.get_peer_fingerprint(peer_id)
                peers.append(WebPeer(
                    id=peer_id,
                    nickname=peer.nickname or peer_id[:8],
                    is_online=True,
                    fingerprint=fingerprint[:8] if fingerprint else None
                ))
            return jsonify([asdict(p) for p in peers])
        
        @self.app.route('/api/channels')
        def get_channels():
            channels = []
            all_channels = set(self.bitchat.chat_context.active_channels) | self.bitchat.discovered_channels
            
            for channel in all_channels:
                channels.append(WebChannel(
                    name=channel,
                    is_joined=channel in self.bitchat.chat_context.active_channels,
                    is_protected=channel in self.bitchat.password_protected_channels,
                    has_key=channel in self.bitchat.channel_keys,
                    member_count=len(self.bitchat.peers) if channel in self.bitchat.chat_context.active_channels else 0,
                    owner=self.bitchat.channel_creators.get(channel)
                ))
            
            return jsonify([asdict(c) for c in channels])
        
        @self.app.route('/api/messages')
        def get_messages():
            # Return last 50 messages
            return jsonify([asdict(msg) for msg in self.messages[-50:]])
        
        @self.app.route('/api/send_message', methods=['POST'])
        def send_message():
            data = request.get_json()
            content = data.get('content', '').strip()
            
            if not content:
                return jsonify({'error': 'Message content is required'}), 400
            
            try:
                # Queue message for sending in BitChat thread
                self.message_queue.put(('send_message', content))
                return jsonify({'success': True})
            except Exception as e:
                logger.error(f"Failed to send message: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/send_private', methods=['POST'])
        def send_private():
            data = request.get_json()
            content = data.get('content', '').strip()
            target_nickname = data.get('target')
            
            if not content or not target_nickname:
                return jsonify({'error': 'Content and target required'}), 400
            
            try:
                self.message_queue.put(('send_private', content, target_nickname))
                return jsonify({'success': True})
            except Exception as e:
                logger.error(f"Failed to send private message: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/join_channel', methods=['POST'])
        def join_channel():
            data = request.get_json()
            channel = data.get('channel', '').strip()
            password = data.get('password', '')
            
            if not channel.startswith('#'):
                channel = f"#{channel}"
            
            try:
                self.message_queue.put(('join_channel', channel, password))
                return jsonify({'success': True})
            except Exception as e:
                logger.error(f"Failed to join channel: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/change_nickname', methods=['POST'])
        def change_nickname():
            data = request.get_json()
            nickname = data.get('nickname', '').strip()
            
            if not nickname:
                return jsonify({'error': 'Nickname is required'}), 400
            
            try:
                self.message_queue.put(('change_nickname', nickname))
                return jsonify({'success': True})
            except Exception as e:
                logger.error(f"Failed to change nickname: {e}")
                return jsonify({'error': str(e)}), 500
        
        @self.app.route('/api/switch_mode', methods=['POST'])
        def switch_mode():
            data = request.get_json()
            mode_type = data.get('type')  # 'public', 'channel', 'dm'
            target = data.get('target', '')
            
            try:
                self.message_queue.put(('switch_mode', mode_type, target))
                return jsonify({'success': True})
            except Exception as e:
                logger.error(f"Failed to switch mode: {e}")
                return jsonify({'error': str(e)}), 500
    
    def setup_socket_handlers(self):
        """Setup SocketIO event handlers"""
        
        @self.socketio.on('connect')
        def handle_connect():
            logger.info(f"Client connected: {request.sid}")
            join_room('bitchat')
            emit('connection_status', {'status': self.connection_status})
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            logger.info(f"Client disconnected: {request.sid}")
            leave_room('bitchat')
    
    def get_current_mode_info(self):
        """Get current chat mode information"""
        mode = self.bitchat.chat_context.current_mode
        
        if isinstance(mode, Public):
            return {'type': 'public', 'name': 'Public Chat'}
        elif isinstance(mode, Channel):
            return {'type': 'channel', 'name': mode.name}
        elif isinstance(mode, PrivateDM):
            return {'type': 'dm', 'name': f"DM with {mode.nickname}"}
        else:
            return {'type': 'unknown', 'name': 'Unknown'}
    
    async def web_display_message(self, message, packet, is_private: bool):
        """Override of display_message to capture messages for web UI"""
        # Call original display function first
        await self.original_display_message(message, packet, is_private)
        
        # Create web message
        sender_nick = self.bitchat.peers.get(packet.sender_id_str, Peer()).nickname or packet.sender_id_str[:8]
        
        # Decrypt channel messages if needed
        display_content = message.content
        if message.is_encrypted and message.channel and message.channel in self.bitchat.channel_keys:
            try:
                creator_fingerprint = self.bitchat.channel_creators.get(message.channel, '')
                decrypted = self.bitchat.encryption_service.decrypt_from_channel(
                    message.encrypted_content,
                    message.channel,
                    self.bitchat.channel_keys[message.channel],
                    creator_fingerprint
                )
                display_content = decrypted
            except:
                display_content = "[Encrypted - decryption failed]"
        elif message.is_encrypted:
            display_content = "[Encrypted - join channel with password]"
        
        web_message = WebMessage(
            id=message.id,
            content=display_content,
            sender=sender_nick,
            sender_id=packet.sender_id_str,
            timestamp=datetime.now().isoformat(),
            is_private=is_private,
            is_channel=bool(message.channel),
            channel=message.channel,
            recipient=self.bitchat.nickname if is_private else None,
            is_encrypted=message.is_encrypted,
            is_own=packet.sender_id_str == self.bitchat.my_peer_id
        )
        
        self.messages.append(web_message)
        
        # Keep only last 100 messages in memory
        if len(self.messages) > 100:
            self.messages = self.messages[-100:]
        
        # Emit to all connected clients
        self.socketio.emit('new_message', asdict(web_message), room='bitchat')
    
    def web_handle_disconnect(self, client):
        """Override of handle_disconnect to update web clients"""
        self.bitchat.handle_disconnect(client)
        self.connection_status = "disconnected"
        self.socketio.emit('connection_status', {'status': 'disconnected'}, room='bitchat')
    
    async def process_message_queue(self):
        """Process messages from web interface"""
        while self.running:
            try:
                if not self.message_queue.empty():
                    item = self.message_queue.get_nowait()
                    command = item[0]
                    
                    if command == 'send_message':
                        content = item[1]
                        if isinstance(self.bitchat.chat_context.current_mode, PrivateDM):
                            await self.bitchat.send_private_message(
                                content,
                                self.bitchat.chat_context.current_mode.peer_id,
                                self.bitchat.chat_context.current_mode.nickname
                            )
                        else:
                            await self.bitchat.send_public_message(content)
                    
                    elif command == 'send_private':
                        content, target_nickname = item[1], item[2]
                        # Find peer
                        target_peer_id = None
                        for peer_id, peer in self.bitchat.peers.items():
                            if peer.nickname == target_nickname:
                                target_peer_id = peer_id
                                break
                        
                        if target_peer_id:
                            await self.bitchat.send_private_message(content, target_peer_id, target_nickname)
                    
                    elif command == 'join_channel':
                        channel, password = item[1], item[2]
                        await self.bitchat.handle_join_channel(f"/j {channel} {password}".strip())
                    
                    elif command == 'change_nickname':
                        nickname = item[1]
                        self.bitchat.nickname = nickname
                        announce_packet = self.bitchat.create_bitchat_packet(
                            self.bitchat.my_peer_id, 
                            self.bitchat.MessageType.ANNOUNCE, 
                            nickname.encode()
                        )
                        await self.bitchat.send_packet(announce_packet)
                        await self.bitchat.save_app_state()
                    
                    elif command == 'switch_mode':
                        mode_type, target = item[1], item[2]
                        if mode_type == 'public':
                            self.bitchat.chat_context.switch_to_public()
                        elif mode_type == 'channel':
                            self.bitchat.chat_context.switch_to_channel(target)
                        elif mode_type == 'dm':
                            # Find peer
                            target_peer_id = None
                            for peer_id, peer in self.bitchat.peers.items():
                                if peer.nickname == target:
                                    target_peer_id = peer_id
                                    break
                            if target_peer_id:
                                self.bitchat.chat_context.enter_dm_mode(target, target_peer_id)
                
                await asyncio.sleep(0.1)
                
            except Exception as e:
                logger.error(f"Error processing message queue: {e}")
                await asyncio.sleep(0.5)
    
    async def run_bitchat(self):
        """Run BitChat client in async thread"""
        try:
            # Connect to BLE
            connected = await self.bitchat.connect()
            if connected:
                self.connection_status = "connected"
                self.socketio.emit('connection_status', {'status': 'connected'}, room='bitchat')
            
            # Perform handshake
            await self.bitchat.handshake()
            
            # Start background scanner if not connected
            if not connected or not self.bitchat.client:
                self.bitchat.background_scanner_task = asyncio.create_task(self.bitchat.background_scanner())
            
            # Process message queue
            await self.process_message_queue()
            
        except Exception as e:
            logger.error(f"BitChat error: {e}")
        finally:
            self.running = False
    
    def run_bitchat_thread(self):
        """Thread wrapper for running BitChat"""
        # Create new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            loop.run_until_complete(self.run_bitchat())
        except Exception as e:
            logger.error(f"BitChat thread error: {e}")
        finally:
            loop.close()
    
    def start(self, host='localhost', port=5000, debug=False):
        """Start the web UI"""
        logger.info("Starting BitChat Web UI...")
        
        self.running = True
        
        # Start BitChat in separate thread
        self.bitchat_thread = threading.Thread(target=self.run_bitchat_thread, daemon=True)
        self.bitchat_thread.start()
        
        # Handle shutdown gracefully
        def signal_handler(sig, frame):
            logger.info("Shutting down...")
            self.running = False
            if self.bitchat_thread:
                self.bitchat_thread.join(timeout=5)
            sys.exit(0)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # Start Flask-SocketIO server
        logger.info(f"Web UI available at http://{host}:{port}")
        self.socketio.run(self.app, host=host, port=port, debug=debug)

def main():
    """Main entry point"""
    client = WebBitchatClient()
    client.start(host='0.0.0.0', port=5000, debug=False)

if __name__ == "__main__":
    main()
