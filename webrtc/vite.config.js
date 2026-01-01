
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: '0.0.0.0', // Listen on all addresses
        port: 8085,
        strictPort: true, // Fail if port is in use
        watch: {
            usePolling: true
        }
    },
    clearScreen: false,
    build: {
        target: 'esnext',
        outDir: 'dist'
    }
});
