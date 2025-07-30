// BitChat Web UI JavaScript
class BitChatWebUI {
    constructor() {
        this.socket = null;
        this.connectionStatus = 'disconnected';
        this.currentMode = { type: 'public', name: 'Public Chat' };
        this.messages = [];
        this.peers = [];
        this.channels = [];
        this.userInfo = {
            nickname: 'Loading...',
            peer_id: '',
            peer_count: 0,
            session_count: 0
        };
        
        this.init();
    }
    
    init() {
        this.initializeSocket();
        this.bindEventHandlers();
        this.updateUI();
        this.loadInitialData();
    }
    
    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.showToast('Connected to server', 'success');
        });
        
        this.socket.on('disconnect', () => {
            this.connectionStatus = 'disconnected';
            this.updateConnectionStatus();
            this.showToast('Disconnected from server', 'error');
        });
        
        this.socket.on('connection_status', (data) => {
            this.connectionStatus = data.status;
            this.updateConnectionStatus();
        });
        
        this.socket.on('new_message', (message) => {
            this.addMessage(message);
        });
        
        // Periodic data refresh
        setInterval(() => {
            this.loadStatusData();
            this.loadPeers();
            this.loadChannels();
        }, 5000);
    }
    
    bindEventHandlers() {
        // Message form
        const messageForm = document.getElementById('messageForm');
        const messageInput = document.getElementById('messageInput');
        
        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });
        
        messageInput.addEventListener('input', () => {
            this.updateCharCount();
        });
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Settings modal
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const cancelSettings = document.getElementById('cancelSettings');
        const saveSettings = document.getElementById('saveSettings');
        
        settingsBtn.addEventListener('click', () => {
            this.openSettingsModal();
        });
        
        closeSettingsModal.addEventListener('click', () => {
            this.closeModal('settingsModal');
        });
        
        cancelSettings.addEventListener('click', () => {
            this.closeModal('settingsModal');
        });
        
        saveSettings.addEventListener('click', () => {
            this.saveSettings();
        });
        
        // Join channel modal
        const joinChannelBtn = document.getElementById('joinChannelBtn');
        const joinChannelModal = document.getElementById('joinChannelModal');
        const closeJoinChannelModal = document.getElementById('closeJoinChannelModal');
        const cancelJoinChannel = document.getElementById('cancelJoinChannel');
        const joinChannelConfirm = document.getElementById('joinChannelConfirm');
        
        joinChannelBtn.addEventListener('click', () => {
            this.openModal('joinChannelModal');
        });
        
        closeJoinChannelModal.addEventListener('click', () => {
            this.closeModal('joinChannelModal');
        });
        
        cancelJoinChannel.addEventListener('click', () => {
            this.closeModal('joinChannelModal');
        });
        
        joinChannelConfirm.addEventListener('click', () => {
            this.joinChannel();
        });
        
        // Private message modal
        const privateMessageModal = document.getElementById('privateMessageModal');
        const closePrivateMessageModal = document.getElementById('closePrivateMessageModal');
        const cancelPrivateMessage = document.getElementById('cancelPrivateMessage');
        const sendPrivateMessageConfirm = document.getElementById('sendPrivateMessageConfirm');
        
        closePrivateMessageModal.addEventListener('click', () => {
            this.closeModal('privateMessageModal');
        });
        
        cancelPrivateMessage.addEventListener('click', () => {
            this.closeModal('privateMessageModal');
        });
        
        sendPrivateMessageConfirm.addEventListener('click', () => {
            this.sendPrivateMessage();
        });
        
        // Mode switcher
        document.addEventListener('click', (e) => {
            if (e.target.closest('.conversation-item')) {
                const item = e.target.closest('.conversation-item');
                const mode = item.dataset.mode;
                
                if (mode === 'public') {
                    this.switchMode('public', '');
                }
            }
            
            if (e.target.closest('.channel-item')) {
                const item = e.target.closest('.channel-item');
                const channel = item.dataset.channel;
                this.switchMode('channel', channel);
            }
            
            if (e.target.closest('.peer-item')) {
                const item = e.target.closest('.peer-item');
                const nickname = item.dataset.nickname;
                this.switchMode('dm', nickname);
            }
        });
        
        // Modal background clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
        
        // Context menu for peers (right-click to send private message)
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.peer-item')) {
                e.preventDefault();
                const item = e.target.closest('.peer-item');
                const nickname = item.dataset.nickname;
                this.openPrivateMessageModal(nickname);
            }
        });
    }
    
    async loadInitialData() {
        await this.loadStatusData();
        await this.loadPeers();
        await this.loadChannels();
        await this.loadMessages();
    }
    
    async loadStatusData() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            this.connectionStatus = data.connected ? 'connected' : 'disconnected';
            this.userInfo = {
                nickname: data.nickname,
                peer_id: data.peer_id,
                peer_count: data.peer_count,
                session_count: data.session_count
            };
            
            if (data.current_mode) {
                this.currentMode = data.current_mode;
            }
            
            this.updateConnectionStatus();
            this.updateUserInfo();
            this.updateStats();
            this.updateCurrentMode();
            
        } catch (error) {
            console.error('Failed to load status:', error);
        }
    }
    
    async loadPeers() {
        try {
            const response = await fetch('/api/peers');
            const data = await response.json();
            this.peers = data;
            this.updatePeersList();
        } catch (error) {
            console.error('Failed to load peers:', error);
        }
    }
    
    async loadChannels() {
        try {
            const response = await fetch('/api/channels');
            const data = await response.json();
            this.channels = data;
            this.updateChannelsList();
        } catch (error) {
            console.error('Failed to load channels:', error);
        }
    }
    
    async loadMessages() {
        try {
            const response = await fetch('/api/messages');
            const data = await response.json();
            this.messages = data;
            this.updateMessagesList();
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    }
    
    updateUI() {
        this.updateConnectionStatus();
        this.updateUserInfo();
        this.updateStats();
        this.updateCurrentMode();
        this.updateCharCount();
    }
    
    updateConnectionStatus() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        statusIndicator.className = 'fas fa-circle status-indicator';
        
        switch (this.connectionStatus) {
            case 'connected':
                statusIndicator.classList.add('connected');
                statusText.textContent = 'Connected';
                break;
            case 'connecting':
                statusIndicator.classList.add('connecting');
                statusText.textContent = 'Connecting...';
                break;
            default:
                statusIndicator.classList.add('disconnected');
                statusText.textContent = 'Disconnected';
        }
    }
    
    updateUserInfo() {
        const userNickname = document.getElementById('userNickname');
        userNickname.textContent = this.userInfo.nickname;
    }
    
    updateStats() {
        const peerCount = document.getElementById('peerCount');
        const sessionCount = document.getElementById('sessionCount');
        
        peerCount.textContent = this.userInfo.peer_count;
        sessionCount.textContent = this.userInfo.session_count;
    }
    
    updateCurrentMode() {
        const modeText = document.getElementById('modeText');
        modeText.textContent = this.currentMode.name;
        
        // Update active conversation item
        document.querySelectorAll('.conversation-item, .channel-item').forEach(item => {
            item.classList.remove('active');
        });
        
        if (this.currentMode.type === 'public') {
            const publicItem = document.querySelector('[data-mode="public"]');
            if (publicItem) publicItem.classList.add('active');
        } else if (this.currentMode.type === 'channel') {
            const channelItem = document.querySelector(`[data-channel="${this.currentMode.name}"]`);
            if (channelItem) channelItem.classList.add('active');
        }
    }
    
    updatePeersList() {
        const peerList = document.getElementById('peerList');
        
        if (this.peers.length === 0) {
            peerList.innerHTML = '<div class="text-muted text-center">No peers online</div>';
            return;
        }
        
        peerList.innerHTML = this.peers.map(peer => `
            <div class="peer-item" data-nickname="${peer.nickname}" title="Right-click to send private message">
                <i class="fas fa-user"></i>
                <span>${peer.nickname}</span>
                <div class="peer-status">
                    ${peer.fingerprint ? '<i class="fas fa-shield-alt text-success" title="Secure session"></i>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    updateChannelsList() {
        const channelList = document.getElementById('channelList');
        
        if (this.channels.length === 0) {
            channelList.innerHTML = '<div class="text-muted text-center">No channels discovered</div>';
            return;
        }
        
        // Add to conversation list dynamically
        const conversationList = document.querySelector('.conversation-list');
        
        // Remove existing channel items from conversation list
        conversationList.querySelectorAll('.channel-item').forEach(item => item.remove());
        
        // Add joined channels to conversation list
        this.channels.filter(ch => ch.is_joined).forEach(channel => {
            const channelItem = document.createElement('div');
            channelItem.className = 'conversation-item channel-item';
            channelItem.dataset.channel = channel.name;
            channelItem.innerHTML = `
                <i class="fas fa-hashtag"></i>
                <span>${channel.name}</span>
                ${channel.is_protected ? '<i class="fas fa-lock" title="Password protected"></i>' : ''}
            `;
            conversationList.appendChild(channelItem);
        });
        
        // Update channels section
        channelList.innerHTML = this.channels.map(channel => `
            <div class="channel-item" data-channel="${channel.name}">
                <i class="fas fa-hashtag"></i>
                <span>${channel.name}</span>
                <div class="channel-status">
                    ${channel.is_joined ? '<span class="status-badge online">Joined</span>' : ''}
                    ${channel.is_protected ? '<i class="fas fa-lock text-warning" title="Password protected"></i>' : ''}
                    ${channel.has_key ? '<i class="fas fa-key text-success" title="Have key"></i>' : ''}
                </div>
            </div>
        `).join('');
    }
    
    updateMessagesList() {
        const messagesContainer = document.getElementById('messages');
        
        if (this.messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-rocket"></i>
                    <h2>Welcome to BitChat</h2>
                    <p>Decentralized • Encrypted • Peer-to-Peer</p>
                    <p>Start by connecting to the BLE mesh network or wait for peers to join.</p>
                </div>
            `;
            return;
        }
        
        messagesContainer.innerHTML = this.messages.map(msg => this.formatMessage(msg)).join('');
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    formatMessage(message) {
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const isOwn = message.is_own;
        const messageClass = isOwn ? 'message own' : 'message other';
        const typeClass = message.is_private ? 'private' : (message.is_channel ? 'channel' : '');
        
        let prefix = '';
        if (message.is_private) {
            prefix = isOwn ? `→ ${message.recipient}` : `${message.sender} → you`;
        } else if (message.channel) {
            prefix = `${message.sender} @ ${message.channel}`;
        } else {
            prefix = message.sender;
        }
        
        return `
            <div class="${messageClass} ${typeClass}">
                <div class="message-header">
                    <span class="message-sender">${prefix}</span>
                    <span class="message-timestamp">${timestamp}</span>
                </div>
                <div class="message-content">${this.escapeHtml(message.content)}</div>
            </div>
        `;
    }
    
    addMessage(message) {
        this.messages.push(message);
        
        // Keep only last 50 messages
        if (this.messages.length > 50) {
            this.messages = this.messages.slice(-50);
        }
        
        // Add message to DOM
        const messagesContainer = document.getElementById('messages');
        const welcomeMessage = messagesContainer.querySelector('.welcome-message');
        
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        const messageElement = document.createElement('div');
        messageElement.innerHTML = this.formatMessage(message);
        messagesContainer.appendChild(messageElement.firstElementChild);
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Show desktop notification if not focused
        if (!document.hasFocus() && !message.is_own) {
            this.showDesktopNotification(message);
        }
    }
    
    updateCharCount() {
        const messageInput = document.getElementById('messageInput');
        const charCount = document.getElementById('charCount');
        const currentLength = messageInput.value.length;
        
        charCount.textContent = `${currentLength}/1000`;
        
        if (currentLength > 900) {
            charCount.classList.add('text-warning');
        } else {
            charCount.classList.remove('text-warning');
        }
    }
    
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();
        
        if (!content) return;
        
        try {
            const response = await fetch('/api/send_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });
            
            if (response.ok) {
                messageInput.value = '';
                this.updateCharCount();
            } else {
                const error = await response.json();
                this.showToast(`Failed to send message: ${error.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Network error: ${error.message}`, 'error');
        }
    }
    
    async sendPrivateMessage() {
        const target = document.getElementById('privateMessageTarget').value;
        const content = document.getElementById('privateMessageContent').value.trim();
        
        if (!content || !target) return;
        
        try {
            const response = await fetch('/api/send_private', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content, target })
            });
            
            if (response.ok) {
                this.closeModal('privateMessageModal');
                document.getElementById('privateMessageContent').value = '';
                this.showToast(`Private message sent to ${target}`, 'success');
            } else {
                const error = await response.json();
                this.showToast(`Failed to send private message: ${error.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Network error: ${error.message}`, 'error');
        }
    }
    
    async joinChannel() {
        const channelName = document.getElementById('channelNameInput').value.trim();
        const password = document.getElementById('channelPasswordInput').value;
        
        if (!channelName) {
            this.showToast('Channel name is required', 'warning');
            return;
        }
        
        const channel = channelName.startsWith('#') ? channelName : `#${channelName}`;
        
        try {
            const response = await fetch('/api/join_channel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ channel, password })
            });
            
            if (response.ok) {
                this.closeModal('joinChannelModal');
                document.getElementById('channelNameInput').value = '';
                document.getElementById('channelPasswordInput').value = '';
                this.showToast(`Joining channel ${channel}`, 'info');
                
                // Refresh channels list
                setTimeout(() => this.loadChannels(), 1000);
            } else {
                const error = await response.json();
                this.showToast(`Failed to join channel: ${error.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Network error: ${error.message}`, 'error');
        }
    }
    
    async saveSettings() {
        const nickname = document.getElementById('nicknameInput').value.trim();
        
        if (!nickname) {
            this.showToast('Nickname is required', 'warning');
            return;
        }
        
        if (!/^[a-zA-Z0-9_-]+$/.test(nickname)) {
            this.showToast('Invalid nickname format', 'warning');
            return;
        }
        
        try {
            const response = await fetch('/api/change_nickname', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ nickname })
            });
            
            if (response.ok) {
                this.closeModal('settingsModal');
                this.showToast('Nickname updated', 'success');
                
                // Refresh status
                setTimeout(() => this.loadStatusData(), 500);
            } else {
                const error = await response.json();
                this.showToast(`Failed to update nickname: ${error.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Network error: ${error.message}`, 'error');
        }
    }
    
    async switchMode(type, target) {
        try {
            const response = await fetch('/api/switch_mode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type, target })
            });
            
            if (response.ok) {
                // Update current mode immediately for better UX
                switch (type) {
                    case 'public':
                        this.currentMode = { type: 'public', name: 'Public Chat' };
                        break;
                    case 'channel':
                        this.currentMode = { type: 'channel', name: target };
                        break;
                    case 'dm':
                        this.currentMode = { type: 'dm', name: `DM with ${target}` };
                        break;
                }
                
                this.updateCurrentMode();
                this.showToast(`Switched to ${this.currentMode.name}`, 'info');
                
                // Refresh status
                setTimeout(() => this.loadStatusData(), 500);
            } else {
                const error = await response.json();
                this.showToast(`Failed to switch mode: ${error.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Network error: ${error.message}`, 'error');
        }
    }
    
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        
        // Focus first input
        const firstInput = modal.querySelector('input, textarea');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
    }
    
    openSettingsModal() {
        const nicknameInput = document.getElementById('nicknameInput');
        const peerIdDisplay = document.getElementById('peerIdDisplay');
        const connectionInfo = document.getElementById('connectionInfo');
        
        nicknameInput.value = this.userInfo.nickname;
        peerIdDisplay.value = this.userInfo.peer_id;
        connectionInfo.value = `Status: ${this.connectionStatus}\nPeers: ${this.userInfo.peer_count}\nSecure Sessions: ${this.userInfo.session_count}`;
        
        this.openModal('settingsModal');
    }
    
    openPrivateMessageModal(nickname) {
        const targetInput = document.getElementById('privateMessageTarget');
        const targetName = document.getElementById('privateMessageTargetName');
        
        targetInput.value = nickname;
        targetName.textContent = nickname;
        
        this.openModal('privateMessageModal');
    }
    
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = this.getToastIcon(type);
        
        toast.innerHTML = `
            <i class="fas ${icon}"></i>
            <div class="toast-content">
                <div class="toast-message">${this.escapeHtml(message)}</div>
            </div>
            <button class="btn-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }
    
    getToastIcon(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info': return 'fa-info-circle';
            default: return 'fa-info-circle';
        }
    }
    
    showDesktopNotification(message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const title = message.is_private ? 'Private Message' : 
                         message.channel ? `#${message.channel}` : 'BitChat';
            
            const notification = new Notification(title, {
                body: `${message.sender}: ${message.content}`,
                icon: '/static/favicon.ico',
                tag: 'bitchat-message'
            });
            
            setTimeout(() => notification.close(), 5000);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Initialize BitChat Web UI
    window.bitchat = new BitChatWebUI();
    
    console.log('BitChat Web UI initialized');
});
