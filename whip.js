/* MIT License
Copyright (c) 2025 Steve Seguin
https://github.com/steveseguin/whip
You need to retain this copyright notice.
This free software is provided "as-is".
 */
"use strict";
const fs = require("fs");
const http = require("http");
const https = require("https");
const express = require("express");
const app = express();
const WebSocket = require("ws");
const fetch = require('node-fetch');
const crypto = require('crypto');
const path = require('path');

// SSL Configuration (fails to non-SSL)
let server;
try {
    const sslConfig = {
        key: fs.readFileSync(process.env.KEY_PATH || "./key.pem"),  /// UPDATE THIS PATH
        cert: fs.readFileSync(process.env.CERT_PATH || "./cert.pem") /// UPDATE THIS PATH
    };
    server = https.createServer(sslConfig, app);
    console.log("SSL enabled");
} catch(e) {
    console.log("SSL certificates not found, falling back to HTTP");
    server = http.createServer(app);
}

var websocketServer = new WebSocket.Server({ server });

var callback = {};
var clients = [];

// Define ICE servers configuration
const iceServers = [ // not quite according to spec, since OBS 30 isn't following it exactly. I'll need to revisit.
    '<stun:stun.l.google.com:19302>; rel="ice-server"',
    '<stun:stun.cloudflare.com:3478>; rel="ice-server"',
    '<turn:turn.yourdomain.com:3478>; rel="ice-server"; username="someUsername"; credential="setupYourOwnPlease"; credential-type="password"'
];  // note: I think it should rather be like: 'stun:stun.l.google.com:19302; rel="ice-server"', 

// CORS and headers middleware
app.all('/*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Expose-Headers", "Content-Type, Location, Link, Whep");
    next();
});

// Handle OPTIONS requests
app.options('*', (req, res) => {
    console.log("OPTIONS");
    res.header('Access-Control-Allow-Methods', 'GET, PATCH, PUT, POST, DELETE, OPTIONS');
    iceServers.forEach(server => {res.append('Link', server);});
    res.status(200).send();
});

// Restore original GET route handler
app.get('*', (req, res) => {
    console.log("GET");
    if (req.get('host') == "whep.vdo.ninja") {
        const path = req.path;
        if (path !== '/' && path.length > 1) {
            const fullPath = path.startsWith('/') ? path.substring(1) : path;
            const fullUrl = `https://vdo.ninja/?whep=${fullPath}`;
            res.send(`This is a WHEP media stream URL; it requires a WHEP-compatible player to view it.<br /><br />To view it using the VDO.Ninja player, Continue to: <a href="${fullUrl}" target="_blank">${fullUrl}</a><br /><br />(note: the WHEP source must be already active for the stream to load and play)`);
        } else {    
            res.redirect(301, 'https://vdo.ninja/whip');
        }
    } else {
        res.redirect(301, 'https://vdo.ninja/whip');
    }
});

// Restore HEAD and PUT handlers
app.head('*', (req, res) => {
    console.log("HEAD");
    return res.status(405);
});

app.put('*', (req, res) => {
    console.log("PUT");
    return res.status(405);
});

// Request body parsing middleware
app.use(function(req, res, next) {
    var contentType = req.headers['content-type'] || '';
    var mime = contentType.split(';')[0];

    if ((mime !== 'application/trickle-ice-sdpfrag') && 
        (mime !== 'application/sdp') && 
        (mime !== 'application/ice') && 
        (mime !== "application/json")) {
        return next();
    }

    var data = '';
    req.on('data', function(chunk) {
        data += chunk;
    });
    req.on('end', function() {
        req.rawBody = data;
        next();
    });
});


function getRoomFromRequest(req) {
    if (req.query.push) return req.query.push;
    
    if (req.headers.authorization) {
        let bearer = req.headers.authorization.split("Bearer ");
        return bearer.length === 2 ? bearer[1] : req.headers.authorization;
    }
    
    let paths = req.path.split("/");
    if ((paths.length > 1) && paths[paths.length-1].length) {
        return paths[paths.length-1];
    }
    
    return null;
}

// Enhanced PATCH handler for ICE candidates
app.patch('*', async (req, res) => {
    console.log("PATCH");
    
    if (req.headers['content-type'] !== 'application/trickle-ice-sdpfrag') {
        return res.status(415).send('Unsupported Media Type');
    }

    const room = getRoomFromRequest(req);
    if (!room) {
        return res.status(400).send('Bad Request: No stream ID specified');
    }

    try {
        const sdpLines = req.rawBody.split('\r\n');
        let iceUfrag, icePwd;

        // Parse ICE credentials
        for (const line of sdpLines) {
            if (line.startsWith('a=ice-ufrag:')) {
                iceUfrag = line.split(':')[1];
            } else if (line.startsWith('a=ice-pwd:')) {
                icePwd = line.split(':')[1];
            }
        }
		
		if (!iceUfrag || !icePwd) {
			return res.status(400).send('Bad Request: Missing ICE credentials');
		}

        // Parse and validate candidates
        const candidates = sdpLines
            .filter(line => line.startsWith('a=candidate:'))
            .map(line => ({
                candidate: line,
                sdpMLineIndex: 0,
                sdpMid: "0",
                usernameFragment: iceUfrag,
                password: icePwd
            }));

        if (candidates.length === 0) {
            return res.status(400).send('Bad Request: No valid candidates found');
        }

        // Forward to relevant clients
        let clientsInRoom = 0;
        const promises = [];

        clients.forEach(client => {
            if (client.room === room) {
                candidates.forEach(candidate => {
                    promises.push(new Promise((resolve) => {
                        try {
                            client.send(JSON.stringify({
                                type: "candidate",
                                candidate: candidate,
                                streamID: room
                            }));
                            clientsInRoom++;
                            resolve();
                        } catch (e) {
                            console.error("Error sending ICE candidate:", e);
                            resolve();
                        }
                    }));
                });
            }
        });

        await Promise.all(promises);

        if (clientsInRoom === 0) {
            console.warn(`No clients found in room ${room}`);
        }

        res.sendStatus(204);
    } catch (error) {
        console.error('Error processing ICE candidates:', error);
        return res.status(400).send('Bad Request: Invalid ICE candidates');
    }
});

// Restore and enhance POST handler
app.post('*', async (req, res) => {
    console.log("POST");
    
    iceServers.forEach(server => {res.append('Link', server);});
    res.header('Access-Control-Expose-Headers', 'Content-Type, Location, Link, Whep');
    
    if (req.get('host').startsWith("whep.")) {
        return await processRequestWHEP(req, res, "post");
    }
    
    return await processRequest(req, res, "post");
});

// Restore DELETE handler
app.delete('*', async (req, res) => {
    console.log("DELETE");
    return await processRequest(req, res, "delete");
});

async function processRequestWHEP(req, res, meta = 'post') {
  let paths = req.path.split("/");
  console.log("INBOUND WHEP");
  console.log(paths);

  if (req.query.push){
    var room = req.query.push;
    console.log("QUERY: "+room);
  } else if ((paths.length>1) && paths[1].length){
    var room = paths[1];
    console.log("ROOM:"+room);
  } else if (!req.headers.authorization) {
    return res.status(403).json({ error: 'No authorization provided' });
  } else {
    console.log("AUTH: "+req.headers.authorization);
    var bearer = req.headers.authorization.split("Bearer ");
    if (bearer.length!==2){
      var room = req.headers.authorization;
      console.log("ROOM: "+ room);
      // return res.status(403).json({ error: req.headers.authorization }); // not following spec, sadly
    } else {
      var room = bearer[1];
      console.log("room: "+room);
    }
  }

  var counter = 0;
  var pid = Math.random().toString(36).substr(2, 9);
  console.log("new pid:"+pid);
  var promise = new Promise((resolve, reject) => {
    callback[pid] = {};
    callback[pid].resolve = resolve;
    callback[pid].reject = reject;
    setTimeout((pid) => {
      if (callback[pid]){
        callback[pid].resolve('timeout');
        console.log("pid: "+pid);
        delete callback[pid];
      }
    }, 10000, pid);
  });

  var msg = {};
  msg.sdp = req.rawBody;
  msg.get = pid;
  msg.type = meta; 
  msg.streamID = room; // I can probably make an actual room option.
  msg = JSON.stringify(msg);
  console.log(msg)
 
  console.log("Sent to:" +clients.length);

  clients.forEach(client => {
    if (client.room && (client.room === room)){
      try {
        client.send(msg);
      } catch(e){}
    }
  });

    var cb = await promise.then(function(x){
		delete callback[pid];
		return x;
	}).catch(function(x){
		delete callback[pid];
		return x;
	});
    res.status(201);
    res.set('Content-Type', "application/sdp");
    res.set('Location',  '/'+room);
	iceServers.forEach(server => {res.append('Link', server);});

    console.log(cb);
    let x = res.send(""+cb);
    console.log("SENT");
    return x
}

async function processRequest(req, res, meta = null) {
    
    if (req.get('host').startsWith("whep.")) {
        return await processRequestWHEP(req, res, meta);
    } // else whip.vdo.ninja

    
    let paths = req.path.split("/");

    if (req.query.push) {
        var room = req.query.push;
    } else if ((paths.length > 1) && paths[paths.length-1].length) {
        var room = paths[paths.length-1];
    } else if (!req.headers.authorization) {
        return res.status(403).json({
            error: 'No authorization provided'
        });
    } else {
        var bearer = req.headers.authorization.split("Bearer ");
        if (bearer.length !== 2) {
            var room = req.headers.authorization;
            // return res.status(403).json({ error: req.headers.authorization }); // not following spec, sadly
        } else {
            var room = bearer[1];
        }
    }

    var counter = 0;
    var pid = Math.random().toString(36).substr(2, 9);
    var promise = new Promise((resolve, reject) => {
        callback[pid] = {};
        callback[pid].resolve = resolve;
        callback[pid].reject = reject;
        setTimeout((pid) => {
            if (callback[pid]) {
                callback[pid].resolve('timeout');
                delete callback[pid];
            }
        }, 10000, pid);
    });

    var msg = {};
    msg.sdp = req.rawBody;
    msg.get = pid;
    msg.type = meta;
    msg.streamID = room; // I can probably make an actual room option.
    msg = JSON.stringify(msg);

    clients.forEach(client => {
        if (client.room && (client.room === room)) {
            try {
                client.send(msg);
            } catch (e) {}
        }
    });

    var cb = await promise.then(function(x) {
        return x;
    }).catch(function(x) {
        return x;
    });
    delete callback[pid];
	
    res.set('Content-Type', "application/sdp");
    res.set('Location', '/' + room);
	
    res.append('Link', `<${req.originalUrl}>; rel="trickle-ice"`);
	iceServers.forEach(server => {res.append('Link', server);});
    res.header('Access-Control-Expose-Headers', 'Content-Type, Location, Link, Whep');
    res.status(201);
    let x = res.send("" +  cb);
    return x
}
websocketServer.on('connection', (webSocketClient) => {
    clients.push(webSocketClient);

    webSocketClient.on('message', (message) => {
	    if (message.length > 1024 * 1024) { // 1MB limit
			console.error("Message too large");
			return;
		}
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
            return;
        }

        // Handle room joining
        if (!webSocketClient.room) {
            if ("join" in parsedMessage) {
                webSocketClient.room = parsedMessage.join + "";
            }
            return;
        }

        // Handle ICE candidates
        if (parsedMessage.type === "candidate" && parsedMessage.candidate) {
            clients.forEach(client => {
                if (client.room === webSocketClient.room && client !== webSocketClient) {
                    try {
                        client.send(JSON.stringify({
                            type: "candidate",
                            candidate: parsedMessage.candidate,
                            streamID: webSocketClient.room
                        }));
                    } catch (e) {
                        console.error("Error forwarding ICE candidate:", e);
                    }
                }
            });
            return;
        }

        // Handle existing callback functionality
        if (parsedMessage.callback && ("get" in parsedMessage.callback)) {
            if (callback[parsedMessage.callback.get]) {
                try {
                    if ("result" in parsedMessage.callback) {
                        callback[parsedMessage.callback.get].resolve(
                            typeof parsedMessage.callback.result === 'object' 
                                ? JSON.stringify(parsedMessage.callback.result) 
                                : parsedMessage.callback.result
                        );
                    } else {
                        const msgCopy = {...parsedMessage.callback};
                        delete msgCopy.get;
                        callback[parsedMessage.callback.get].resolve(JSON.stringify(msgCopy));
                    }
                } catch (e) {
                    console.error("Error processing callback:", e);
                    callback[parsedMessage.callback.get].reject(e);
                }
            }
        }
    });

    // Existing close/error handlers remain unchanged
    webSocketClient.on("close", () => {
        clients = clients.filter(client => client !== webSocketClient);
    });

    webSocketClient.on("error", (error) => {
        console.error("WebSocket error:", error);
        clients = clients.filter(client => client !== webSocketClient);
    });
});

// Start server
const PORT = process.env.PORT || (server instanceof https.Server ? 443 : 80);
server.listen(PORT, () => {
    console.log(`Server started on port ${PORT} (${server instanceof https.Server ? 'HTTPS' : 'HTTP'})`);
});
