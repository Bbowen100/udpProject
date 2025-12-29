
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: '0.0.0.0', // Listen on all addresses
        port: 8000,      // Match the previous python server port
        strictPort: true, // Fail if port is in use
    },
    build: {
        target: 'esnext',
        outDir: 'dist'
    }
});
