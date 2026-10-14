import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0';

// Middlewares
app.use(express.json());

// Request logging for Render logs
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/health') {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'OmniSheet Pro',
    environment: process.env.NODE_ENV || 'production',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    render: {
      deployedOnRender: Boolean(process.env.RENDER),
      serviceId: process.env.RENDER_SERVICE_ID || 'local',
      serviceName: process.env.RENDER_SERVICE_NAME || 'omni-sheet-pro',
      instanceId: process.env.RENDER_INSTANCE_ID || 'local-instance',
    },
  });
});

app.get('/api/quota-plans', (_req: Request, res: Response) => {
  res.status(200).json({
    rateLimitEngine: 'Netflix-Style Token Bucket & Sliding Window',
    plans: [
      { id: 'free', name: 'Starter Tier', priceRupees: 0, hourlyQuota: 10, burstPerMinute: 25 },
      { id: 'basic_50', name: 'Basic Plan', priceRupees: 50, hourlyQuota: 500, burstPerMinute: 80 },
      { id: 'pro_199', name: 'Pro Collaborative', priceRupees: 199, hourlyQuota: 2500, burstPerMinute: 250 },
      { id: 'enterprise_499', name: 'Enterprise Scale', priceRupees: 499, hourlyQuota: 10000, burstPerMinute: 1000 },
    ],
  });
});

// Serve Vite production build from dist/
const distPath = path.resolve(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

if (fs.existsSync(distPath)) {
  // Static assets with caching
  app.use(express.static(distPath, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA fallback: Return index.html for all non-API GET requests
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(indexPath);
  });
} else {
  console.warn(`[WARN] Dist folder not found at ${distPath}. Run 'npm run build' first.`);
  app.get('*', (_req: Request, res: Response) => {
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
        <head><title>OmniSheet Pro - Building</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#f8fafc;">
          <h1>OmniSheet Pro is initializing...</h1>
          <p>The production frontend is being compiled. Please run <code>npm run build</code> or refresh shortly.</p>
        </body>
      </html>
    `);
  });
}

// Start Server
const server = app.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(`🚀 OmniSheet Pro Server running on http://${HOST}:${PORT}`);
  console.log(`📡 Health Check: http://${HOST}:${PORT}/api/health`);
  console.log(`🌐 Ready for Render Deployment!`);
  console.log(`===============================================`);
});

// Graceful shutdown
const handleShutdown = (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
