import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// public 配下を配信
app.use(express.static(path.join(__dirname, 'public')));

// プロキシ
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url');

  try {
    const response = await fetch(target, { redirect: 'follow' });
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      let html = await response.text();
      // CSPやX-Frame-Options削除
      html = html.replace(/<meta[^>]*(Content-Security-Policy|X-Frame-Options)[^>]*>/gi, '');
      html = html.replace(/<script[^>]*serviceworker[^>]*>.*?<\/script>/gi, '');
      const baseUrl = new URL(target);

      // href/src/url() をすべてプロキシ経由に書き換え
      html = html.replace(/(href|src)="([^"]*)"/g, (m, attr, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          return `${attr}="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch { return m; }
      });
      html = html.replace(/url\(["']?([^"')]+)["']?\)/g, (m, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          return `url("/proxy?url=${encodeURIComponent(absoluteUrl)}")`;
        } catch { return m; }
      });

      res.set('Content-Type', 'text/html; charset=UTF-8');
      return res.send(html);
    } else {
      // HTML以外はそのままストリーム
      res.set('Content-Type', contentType);
      response.body.pipe(res);
    }
  } catch (e) {
    res.status(500).send('Fetch error: ' + e.message);
  }
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
