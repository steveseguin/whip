/* MIT License
Copyright (c) 2023 Steve Seguin
https://github.com/steveseguin/whip
You need to retain this copyright notice.
This free software is provided "as-is".
 */
"use strict";
var fs = require("fs");
//var https = require("https");
var http = require("http")
var express = require("express");
var app = express();
var WebSocket = require("ws");
var cors = require('cors');
var fetch = require('node-fetch'); // npm install node-fetch@2

//const key = fs.readFileSync("/etc/letsencrypt/live/wss.contribute.cam/privkey.pem");
//const cert = fs.readFileSync("/etc/letsencrypt/live/wss.contribute.cam/fullchain.pem");

//var server = https.createServer({key,cert}, app);
var server = http.createServer(app); // in this app, I'm going to rely on Cloudflare for SSL. keep life easy
var websocketServer = new WebSocket.Server({
  server
});

var callback = {};
var clients = [];

//app.use(cors({
//    origin: '*'
//}));

app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  //  res.header("Access-Control-Expose-Headers", "*");
  next();
});

app.options(`*`, (req, res) => {
  console.log("OPTIONS");
  res.header('Access-Control-Allow-Methods', 'GET, PATCH, PUT, POST, DELETE, OPTIONS');
  res.set('Link', ['<stun:stun.l.google.com:19302>; rel="ice-server"', '<turn:turn-cae1.vdo.ninja:3478>; rel="ice-server"; username="steve"; credential="setupYourOwnPlease"; credential-type="password"']);
  res.status(200).send()
})

app.get('*', (req, res) => {
  console.log("GET")
  return res.status(405);
});

app.head('*', (req, res) => {
  console.log("HEAD");
  return res.status(405);
});

app.put('*', (req, res) => {
  console.log("PUT");
  return res.status(405);
});

app.use(function(req, res, next) {
  var contentType = req.headers['content-type'] || '';
  var mime = contentType.split(';')[0];

  console.log("mime:" + (mime || "unknown"));

  if ((mime !== 'application/trickle-ice-sdpfrag') && (mime !== 'application/sdp') && (mime !== 'application/ice')) {
    return next();
  }

  var data = '';
  //req.setEncoding('utf8');
  req.on('data', function(chunk) {
    data += chunk;
  });
  req.on('end', function() {
    req.rawBody = data;
    next();
  });
});

app.post('*', async (req, res) => {
  console.log("POST");
  return await processRequest(req, res, "post");
});

app.patch('*', async (req, res) => {
  console.log("PATCH");
  return await processRequest(req, res, "patch");
});

app.delete('*', async (req, res) => {
  console.log("DELETE");
  return await processRequest(req, res, "delete");
});

var fetch = require('node-fetch'); // npm install node-fetch@2

async function processRequestTwitch(req, res, meta = 'post') {

  console.log("PROCESS");
  let paths = req.path.split("/");
  console.log(paths);

  if (req.query.push) {
    var room = req.query.push;
    console.log("QUERY: " + room);
  } else if ((paths.length > 1) && paths[1].length) {
    var room = paths[1];
    console.log("ROOM:" + room);
  } else if (!req.headers.authorization) {
    return res.status(403).json({
      error: 'No authorization provided'
    });
  } else {
    console.log("AUTH: " + req.headers.authorization);
    var bearer = req.headers.authorization.split("Bearer ");
    if (bearer.length !== 2) {
      var room = req.headers.authorization;
      console.log("ROOM: " + room);
      // return res.status(403).json({ error: req.headers.authorization }); // not following spec, sadly
    } else {
      var room = bearer[1];
      console.log("room: " + room);
    }
  }


  const response = await fetch('https://g.webrtc.live-video.net:4443/v2/offer', {
    method: meta,
    body: req.rawBody,
    headers: {
      'Content-Type': 'application/sdp',
      'Authorization': 'Bearer ' + room
    }
  });
  const data = await response.text();


  res.status(201);
  res.set('Content-Type', "application/sdp");
  res.set('Location', 'https://twitch.vdo.ninja/' + room); // todo
  res.set('Link', ['<stun:stun.l.google.com:19302>; rel="ice-server"', '<turn:turn-cae1.vdo.ninja:3478?transport=udp>; rel="ice-server"; username="steve"; credential="setupYourOwnPlease"; credential-type="password"']);
  return res.send(data);
}

async function processRequest(req, res, meta = null) {

  if (req.get('host') == "twitch.vdo.ninja") {
    return await processRequestTwitch(req, res, meta);
  }

  console.log("PROCESS");
  let paths = req.path.split("/");
  console.log(paths);

  if (req.query.push) {
    var room = req.query.push;
    console.log("QUERY: " + room);
  } else if ((paths.length > 1) && paths[1].length) {
    var room = paths[1];
    console.log("ROOM:" + room);
  } else if (!req.headers.authorization) {
    return res.status(403).json({
      error: 'No authorization provided'
    });
  } else {
    console.log("AUTH: " + req.headers.authorization);
    var bearer = req.headers.authorization.split("Bearer ");
    if (bearer.length !== 2) {
      var room = req.headers.authorization;
      console.log("ROOM: " + room);
      // return res.status(403).json({ error: req.headers.authorization }); // not following spec, sadly
    } else {
      var room = bearer[1];
      console.log("room: " + room);
    }
  }

  var counter = 0;
  var pid = Math.random().toString(36).substr(2, 9);
  console.log("new pid:" + pid);
  var promise = new Promise((resolve, reject) => {
    callback[pid] = {};
    callback[pid].resolve = resolve;
    callback[pid].reject = reject;
    setTimeout((pid) => {
      if (callback[pid]) {
        callback[pid].resolve('timeout');
        console.log("pid: " + pid);
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

  console.log("Sent to:" + clients.length);

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
  res.status(201);
  res.set('Content-Type', "application/sdp");
  res.set('Location', 'https://whip.vdo.ninja/' + room);
  res.set('Link', ['<stun:stun.l.google.com:19302>; rel="ice-server"', '<turn:turn-cae1.vdo.ninja:3478?transport=udp>; rel="ice-server"; username="steve"; credential="setupYourOwnPlease"; credential-type="password"']);

  console.log(cb);
  let x = res.send("" + cb);
  console.log("SENT");
  return x
}

websocketServer.on('connection', (webSocketClient) => {

  clients.push(webSocketClient);
  console.log("NEW CONNECTION");

  var room = false;
  var out = false;
  webSocketClient.on('message', (message) => {
    try {
      if (!webSocketClient.room) {
        try {
          var msg = JSON.parse(message);
          if ("join" in msg) {
            room = msg.join + "";
            webSocketClient.room = room;
          }
          return;
        } catch (e) {
          return;
        }
      }

      try {
        var msg = JSON.parse(message);
      } catch (e) {
        return;
      }

      if (msg.callback && ("get" in msg.callback)) {
        if (callback[msg.callback.get]) {
          if ("result" in msg.callback) {
            if (typeof msg.callback.result == 'object') {
              callback[msg.callback.get].resolve(JSON.stringify(msg.callback.result));
            } else {
              callback[msg.callback.get].resolve(msg.callback.result);
            }
          } else {
            try {
              var msg = message.callback;
              delete msg.get;
              callback[msg.callback.get].resolve(JSON.stringify(msg));
            } catch (e) {}
          }
        }
        return;
      }

    } catch (e) {
      console.log(e);
    }
  });

  function closeOrErrorHandler(evt) {
    clients = clients.filter(member => member !== webSocketClient);
  }

  webSocketClient.on("close", closeOrErrorHandler);
  webSocketClient.on("error", closeOrErrorHandler);

});
//server.listen(443, () => {console.log(`Server started on port 443`) });
server.listen(80, () => {
  console.log(`Server started on port 80`)
});
