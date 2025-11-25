const Turn = require('node-turn');

const server = new Turn({
    // set options
    authMech: 'long-term',
    credentials: {
        "user": "password"
    },
    listeningPort: 3478,
    listeningIps: ['127.0.0.1'],
    relayIps: ['127.0.0.1'],
    debugLevel: 'ALL'
});

server.start();
console.log('TURN server started on port 3478');
