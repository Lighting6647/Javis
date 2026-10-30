import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function startServer(port = 5173) {
  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let reqPath = decodeURIComponent(parsedUrl.pathname);

    // 1. High-Performance Thai Neural TTS Audio Proxy
    if (reqPath === '/api/tts') {
      const text = parsedUrl.searchParams.get('text') || '';
      if (!text.trim()) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Missing text parameter');
        return;
      }

      const encoded = encodeURIComponent(text.slice(0, 200));
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encoded}`;

      fetch(googleUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
        .then(async (ttsRes) => {
          if (!ttsRes.ok) {
            throw new Error(`Google TTS status: ${ttsRes.status}`);
          }
          const buffer = await ttsRes.arrayBuffer();
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.byteLength,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
          });
          res.end(Buffer.from(buffer));
        })
        .catch((err) => {
          console.error('[TTS Proxy Error]:', err.message);
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('TTS Error: ' + err.message);
        });
      return;
    }

    // 2. One-Click Real Project Launcher for sir ไลท์ (D:\Light Ecosystem)
    if (reqPath === '/api/launch-project') {
      const projId = parsedUrl.searchParams.get('id') || 'pos';
      const PROJECT_PATHS = {
        pos: 'D:\\Light\\Inventoty AI Light',
        ticket: 'D:\\Light\\บัตรคอน Light',
        fit: 'D:\\Light\\Fitness',
        pass: 'D:\\Light\\Pass App Light',
        dashboard: 'D:\\Light\\แดชบอร์ด Light',
        ceo: 'D:\\Light\\CEO',
      };

      const targetPath = PROJECT_PATHS[projId] || 'D:\\Light';

      // Open in Windows Explorer safely
      exec(`explorer.exe "${targetPath}"`, (err) => {
        if (err) {
          console.error('[Launch Project Error]:', err.message);
        }
      });

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        JSON.stringify({
          success: true,
          projectId: projId,
          path: targetPath,
          message: `Opened folder ${targetPath}`,
        })
      );
      return;
    }

    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    let filePath = path.join(distDir, reqPath);

    // If file doesn't exist, fallback to index.html for SPA client-side routing
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        console.error(`[500] ${req.method} ${req.url} - Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error: ' + err.message);
        return;
      }
      console.log(`[200] ${req.method} ${req.url} -> ${contentType}`);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${port} is busy, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('❌ Server error:', err);
    }
  });

  // Listen on all interfaces dual-stack (IPv6 :: and IPv4 0.0.0.0)
  server.listen(port, () => {
    const localUrl = `http://localhost:${port}`;
    const ipUrl = `http://127.0.0.1:${port}`;
    console.log('================================================================');
    console.log('🚀 CEO Master Platform & Krob AI Enterprise is LIVE!');
    console.log('================================================================');
    console.log(`\n  ➜ Local:   ${localUrl}`);
    console.log(`  ➜ Direct:  ${ipUrl}\n`);
    console.log('🌐 Opening browser automatically...');
    console.log('----------------------------------------------------------------');
    console.log('💡 Keep this window open while using the platform.');
    console.log('================================================================\n');

    // Launch both chrome and default browser
    exec(`start "" "${localUrl}"`, (err) => {
      if (err) {
        exec(`start chrome "${localUrl}"`);
      }
    });
  });
}

startServer(5173);
