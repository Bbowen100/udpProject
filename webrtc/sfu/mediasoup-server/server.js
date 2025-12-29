const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mediasoup = require('mediasoup');
const cors = require('cors');
const config = require('./config');
const path = require('path');

const app = express();
app.use(cors());

// Serve mediasoup-client from node_modules
app.use('/libs', express.static(path.join(__dirname, 'node_modules')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
    }
});

let worker;
let router;
let producerTransport;
let consumerTransport;
let producer;
let consumer;

// Map of transports and producers/consumers for simplicity (single room demo)
const transports = new Map();
const producers = new Map();
const consumers = new Map();

async function run() {
    await startMediasoup();

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('getRouterRtpCapabilities', (data, callback) => {
            callback(router.rtpCapabilities);
        });

        socket.on('createProducerTransport', async (data, callback) => {
            try {
                const { transport, params } = await createWebRtcTransport((producer) => {
                    // Callback when producer closes
                    // producer = null;
                    console.log('Producer closed', producer.id);
                });
                producerTransport = transport;
                transports.set(transport.id, transport);
                console.log('Producer transport created, iceCandidates:', params.iceCandidates);

                callback(params);
            } catch (err) {
                console.error(err);
                callback({ error: err.message });
            }
        });

        socket.on('createConsumerTransport', async (data, callback) => {
            try {
                const { transport, params } = await createWebRtcTransport((consumer) => {
                    // Callback when consumer closes
                    // consumer = null;
                    console.log('Consumer closed', consumer.id);
                });
                consumerTransport = transport;
                transports.set(transport.id, transport);
                console.log('Consumer transport created, iceCandidates:', params.iceCandidates);

                callback(params);
            } catch (err) {
                console.error(err);
                callback({ error: err.message });
            }
        });

        socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
            const transport = transports.get(transportId);
            if (transport) {
                await transport.connect({ dtlsParameters });
                callback();
            } else {
                callback({ error: 'Transport not found' });
            }
        });

        socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
            const transport = transports.get(transportId);
            if (transport) {
                producer = await transport.produce({ kind, rtpParameters });
                producers.set(producer.id, producer);

                producer.on('transportclose', () => {
                    console.log('Producer transport closed');
                    producer.close();
                });

                producer.on('close', () => {
                    console.log('Producer closed');
                    producers.delete(producer.id);
                });

                console.log('Producer created:', producer.id);

                // Broadcast to others (or back to self for testing loopback) that a new producer exists
                socket.broadcast.emit('newProducer', { producerId: producer.id });

                callback({ id: producer.id });
            } else {
                callback({ error: 'Transport not found' });
            }
        });

        socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
            try {
                if (!router.canConsume({ producerId, rtpCapabilities })) {
                    return callback({ error: 'Cannot consume' });
                }

                const transport = transports.get(transportId);
                if (!transport) {
                    return callback({ error: 'Transport not found' });
                }

                consumer = await transport.consume({
                    producerId,
                    rtpCapabilities,
                    paused: true,
                });

                consumers.set(consumer.id, consumer);

                consumer.on('transportclose', () => {
                    consumer.close();
                });

                consumer.on('producerclose', () => {
                    consumer.close();
                    socket.emit('consumerClosed', { consumerId: consumer.id });
                });

                callback({
                    id: consumer.id,
                    producerId,
                    kind: consumer.kind,
                    rtpParameters: consumer.rtpParameters,
                    type: consumer.type,
                    producerPaused: consumer.producerPaused
                });

                // Resume immediately for this demo
                await consumer.resume();

            } catch (error) {
                console.error('Consume error:', error);
                callback({ error: error.message });
            }
        });

        // Resume consumer helper
        socket.on('resume', async ({ consumerId }, callback) => {
            const consumer = consumers.get(consumerId);
            if (consumer) {
                await consumer.resume();
                callback();
            }
        });

        socket.on('getProducers', (data, callback) => {
            // Return all producer IDs
            const producerIds = Array.from(producers.keys());
            callback(producerIds);
        });
    });

    server.listen(config.listenPort, config.listenIp, () => {
        console.log(`Mediasoup server listening on ${config.listenIp}:${config.listenPort}`);
    });
}

async function startMediasoup() {
    worker = await mediasoup.createWorker(config.mediasoup.worker);

    worker.on('died', () => {
        console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
        setTimeout(() => process.exit(1), 2000);
    });

    router = await worker.createRouter({ mediaCodecs: config.mediasoup.router.mediaCodecs });
    console.log('Mediasoup Router created');
}

async function createWebRtcTransport(callback) {
    const transport = await router.createWebRtcTransport(config.mediasoup.webRtcTransport);

    transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
            transport.close();
        }
    });

    transport.on('close', () => {
        console.log('Transport closed');
        callback();
    });

    return {
        transport,
        params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        },
    };
}

run();
