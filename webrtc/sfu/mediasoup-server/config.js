module.exports = {
    // Listening Host
    listenIp: '0.0.0.0',
    listenPort: 3000,

    mediasoup: {
        // Worker settings
        numWorkers: Object.keys(require('os').cpus()).length,
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: 'warn',
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
            ],
        },
        // Router settings
        router: {
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2
                }
            ]
        },
        // WebRtcTransport settings
        webRtcTransport: {
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: '172.18.25.146' // Use the IP from Coturn config
                }
            ],
            initialAvailableOutgoingBitrate: 1000000
        }
    }
};
