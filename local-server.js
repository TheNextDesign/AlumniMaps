import express from 'express';
import { createServer as createViteServer } from 'vite';
import pinsHandler from './api/pins.js';

async function startServer() {
    const app = express();
    const PORT = 3000;

    // Middleware to parse JSON bodies (needed for POST requests)
    app.use(express.json());

    // Mount the Vercel API function manually for local context
    // Vercel functions are (req, res), which matches Express!
    app.all('/api/pins', async (req, res) => {
        // Vercel/Node helper adaptation if needed, but basic Express req/res works for this simple case
        await pinsHandler(req, res);
    });

    // Create Vite server in middleware mode
    const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
    });

    // Use vite's connect instance as middleware
    app.use(vite.middlewares);

    app.listen(PORT, () => {
        console.log(`
      🚀 Local Server Running!
      > Local: http://localhost:${PORT}
      > Database: ${process.env.DATABASE_URL ? 'Connected' : 'NOT LINKED (See steps)'}
    `);
    });
}

startServer();
