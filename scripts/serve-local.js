import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');
const LIGHT_ROOT = 'D:\\Light';

// Load GEMINI_API_KEY from .env
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const envPath = path.resolve(__dirname, '..', '.env');
if (!GEMINI_API_KEY && fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
    if (match) GEMINI_API_KEY = match[1].trim();
  } catch (err) {
    console.warn('[ENV Load Warning]:', err.message);
  }
}

// Call Google Gemini API (Dual-model fallback)
async function callGemini(prompt, systemInstruction = '') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const models = ['gemini-flash-lite-latest', 'gemini-3.8-flash-lite', 'gemini-3.5-flash-lite'];
  let lastErr = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return {
          model,
          text: data.candidates[0].content.parts[0].text,
        };
      } else {
        lastErr = new Error(`[${model}]: ${data.error?.message || 'Empty response'}`);
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Gemini models failed');
}

// Helper to read JSON request body
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

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

    // 3. Google Gemini Neural Analysis Bridge for J.A.R.V.I.S.
    if (reqPath === '/api/gemini/analyze') {
      const handleAnalyze = async () => {
        try {
          let prompt = parsedUrl.searchParams.get('prompt') || '';
          let context = parsedUrl.searchParams.get('context') || '';

          if (req.method === 'POST') {
            const body = await readJsonBody(req);
            prompt = body.prompt || prompt;
            context = body.context || context;
          }

          if (!prompt.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Missing prompt parameter' }));
            return;
          }

          const systemInstruction = `คุณคือ J.A.R.V.I.S. MARK III ปัญญาประดิษฐ์ผู้ช่วยส่วนตัวและวิศวกรซอฟต์แวร์ระดับสูงประจำตัวของ 'sir ไลท์' (คุณไลท์)
- พูดจาสุภาพ นิ่ง เฉียบคม และมีตรรกะสูง
- ให้เกียรติและเรียกผู้ใช้งานว่า 'sir ไลท์' เสมอ
- คุณมีความรู้ความเข้าใจใน 18 โปรเจกต์ของ D:\\Light อย่างลึกซึ้ง (Inventoty AI, บัตรคอน, Fitness, Pass App, แดชบอร์ด, CEO, ฯลฯ)
- เมื่อตอบคำถาม ให้วิเคราะห์อย่างเป็นรูปธรรม ให้ข้อเสนอแนะที่นำไปปฏิบัติได้จริง และกระชับ`;

          const result = await callGemini(
            `Context: ${context || 'D:\\Light Ecosystem'}\n\nคำถามหรือคำสั่งจาก sir ไลท์: ${prompt}`,
            systemInstruction
          );

          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              success: true,
              model: result.model,
              reply: result.text,
            })
          );
        } catch (err) {
          console.error('[Gemini Bridge Error]:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      };

      handleAnalyze();
      return;
    }

    // 4. Multi-Project Directory Scanner (D:\Light Ecosystem)
    if (reqPath === '/api/projects/list') {
      try {
        const entries = fs.readdirSync(LIGHT_ROOT, { withFileTypes: true });
        const projects = entries
          .filter((d) => d.isDirectory())
          .map((d) => {
            const pPath = path.join(LIGHT_ROOT, d.name);
            const hasGit = fs.existsSync(path.join(pPath, '.git'));
            const hasPkg = fs.existsSync(path.join(pPath, 'package.json'));
            return {
              id: d.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              name: d.name,
              path: pPath,
              hasGit,
              hasPackageJson: hasPkg,
            };
          });

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ success: true, count: projects.length, projects }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 5. Multi-Project Autonomous Orchestrator (Read, Edit Code, Git Push)
    if (reqPath === '/api/projects/execute') {
      const handleExecute = async () => {
        try {
          const body = await readJsonBody(req);
          const { action, projectName, filePath, content, commitMessage, command } = body;

          const targetDir = projectName ? path.join(LIGHT_ROOT, projectName) : LIGHT_ROOT;
          if (!fs.existsSync(targetDir)) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: `Project not found: ${projectName}` }));
            return;
          }

          // A. Read File
          if (action === 'read_file') {
            const fullPath = path.resolve(targetDir, filePath || '');
            if (!fullPath.startsWith(targetDir)) {
              throw new Error('Access denied outside target directory');
            }
            const data = fs.readFileSync(fullPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, path: fullPath, content: data }));
            return;
          }

          // B. Edit / Write File with Auto-Backup
          if (action === 'edit_file') {
            const fullPath = path.resolve(targetDir, filePath || '');
            if (!fullPath.startsWith(targetDir)) {
              throw new Error('Access denied outside target directory');
            }
            if (fs.existsSync(fullPath)) {
              fs.copyFileSync(fullPath, `${fullPath}.bak`);
            }
            fs.writeFileSync(fullPath, content || '', 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, path: fullPath, backup: `${fullPath}.bak` }));
            return;
          }

          // C. Git Status
          if (action === 'git_status') {
            exec('git status -s', { cwd: targetDir }, (err, stdout, stderr) => {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(
                JSON.stringify({
                  success: !err,
                  status: stdout || '(Working tree clean)',
                  error: err ? stderr : null,
                })
              );
            });
            return;
          }

          // D. Autonomous Git Commit & Push
          if (action === 'git_push') {
            const msg = commitMessage || `[J.A.R.V.I.S. Autonomous Update] for ${projectName}`;
            const gitCmd = `git add . && git commit -m "${msg}" && git push`;
            exec(gitCmd, { cwd: targetDir }, (err, stdout, stderr) => {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(
                JSON.stringify({
                  success: !err,
                  output: stdout || stderr,
                  error: err ? err.message : null,
                })
              );
            });
            return;
          }

          // E. Run Command in Target Project
          if (action === 'run_command' && command) {
            exec(command, { cwd: targetDir }, (err, stdout, stderr) => {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(
                JSON.stringify({
                  success: !err,
                  output: stdout || stderr,
                  error: err ? err.message : null,
                })
              );
            });
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: `Unknown action: ${action}` }));
        } catch (err) {
          console.error('[Project Exec Error]:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      };

      handleExecute();
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
