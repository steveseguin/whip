# WHIP/WHEP Server for VDO.Ninja
A WebRTC HTTP Ingest Protocol (WHIP) and WebRTC HTTP Egress Protocol (WHEP) server implementation specifically designed for VDO.Ninja integration.

## Project Goals
- Enable self-hosting of WHIP/WHEP services for VDO.Ninja
- Provide a spec-compliant WHIP/WHEP endpoint (Work in Progress)
- Allow VDO.Ninja users to replace Meshcast.io with their own WHIP/WHEP service
- Future integration support for popular SFU servers (Cloudflare/PION)

## Important Notes
- This is NOT an SFU server
- Requires an active viewer connected before WHIP streaming can begin
- Some WHIP publishers may have limited NAT traversal support
- Written in Node.js for accessibility and cloud worker compatibility
- The official service runs at whip.vdo.ninja

## Prerequisites
1. Node.js (https://nodejs.org/)
2. npm or yarn package manager
3. SSL certificate (for production) or self-signed cert (for testing)
4. Domain name (recommended for production SSL)

## Quick Start

### Installation
```bash
# Clone the repository
git clone [repository-url]
cd whip-server

# Install dependencies
npm install express ws node-fetch
```

### SSL Setup
For testing/offline use, generate a self-signed certificate:
```bash
openssl req -nodes -new -x509 -keyout key.pem -out cert.pem
```

For production, use Let's Encrypt/Certbot or your preferred SSL provider.

### Configuration
1. Environment variables:

Configure the ENV variables using any of these methods:

```bash
# Temporary (current session)
export KEY_PATH=/path/to/ssl/key.pem
export CERT_PATH=/path/to/ssl/cert.pem
export PORT=8443

# Permanent (user)
echo 'export KEY_PATH=/path/to/ssl/key.pem' >> ~/.bashrc
echo 'export CERT_PATH=/path/to/ssl/cert.pem' >> ~/.bashrc
echo 'export PORT=8443' >> ~/.bashrc
source ~/.bashrc

# System-wide
sudo echo 'KEY_PATH=/path/to/ssl/key.pem
CERT_PATH=/path/to/ssl/cert.pem
PORT=8443' > /etc/environment.d/myapp.conf
```

Check with: `echo $KEY_PATH`

2. ICE Servers:
Edit the iceServers array in server.js to configure your STUN/TURN servers:
```javascript
const iceServers = [
    'stun:stun.l.google.com:19302; rel="ice-server"',
    'stun:stun.cloudflare.com:3478; rel="ice-server"',
    'turn:your.turn.server:3478; rel="ice-server"; username="user"; credential="pass"'
];
```

### Running the Server
Development:
```bash
node whip.js
```

Production (using PM2):
```bash
npm install -g pm2
pm2 start whip.js
pm2 save
```

## VDO.Ninja configuration

If using this with a self-hosted VDO.Ninja, you'll likely be wanting to specify the WHIP address to match you own.

In the `index.html` file, contained in the root of the VDO.Ninja folder, edit the following line:
```
// session.whipServerURL = "wss://whip.vdo.ninja"; // If you deploy your own whip websocket service
```
Uncomment it and change the websocket address to match whatever you are using. eg: `session.whipServerURL = "ws://127.0.0.1:8443";`.

If having problems, double check you have your SSL certs configured correctly, etc.

## Security Considerations
- The server implements a 1MB message size limit for WebSocket connections
- SSL is required for WebRTC in production environments
- CORS headers are preconfigured but may need adjustment
- Custom TURN servers are required for production use
- Authentication is implemented via Bearer tokens or URL parameters

## Integration with VDO.Ninja
To use with a self-hosted VDO.Ninja instance, update your VDO.Ninja configuration to point to your WHIP server instead of whip.vdo.ninja.

## Limitations
- Requires active viewer connection for WHIP publishing
- NAT traversal depends on proper STUN/TURN configuration
- SSL setup is required but not handled by this package
- Limited deployment support available

## Support
- Code issues & feature requests: Create a GitHub issue
- General support: Join the Discord server (discord.vdo.ninja)
- SSL/TURN setup: Outside current support scope

## Contributing
PRs welcome! Please contribute fixes and improvements 💘

## License
MIT License - Copyright (c) 2024 VDO.Ninja
