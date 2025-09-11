import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

// URL マッピング用の辞書
const urlMap = {};

// ランダム ID 生成関数
function generateId(length = 12) {
  return crypto.randomBytes(length).toString('hex');
}

// プロキシエンドポイント（ID 受け取り）
app.get('/proxy/:id', async (req, res) => {
  const target = urlMap[req.params.id];
  if (!target) return res.status(404).send('Not Found');

  try {
    const response = await fetch(target, { redirect: 'manual', headers: { 'Cookie': '' } });
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseUrl = new URL(target);

      // CSPやX-Frame-Options削除
      html = html.replace(/<meta[^>]*(Content-Security-Policy|X-Frame-Options)[^>]*>/gi, '');
      html = html.replace(/<script[^>]*serviceworker[^>]*>.*?<\/script>/gi, '');

      // href, src, url() の書き換え
      html = html.replace(/(href|src)="([^"]*)"/g, (m, attr, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          const id = generateId();
          urlMap[id] = absoluteUrl;
          return `${attr}="/proxy/${id}"`;
        } catch { return m; }
      });

      html = html.replace(/url\(["']?([^"')]+)["']?\)/g, (m, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          const id = generateId();
          urlMap[id] = absoluteUrl;
          return `url("/proxy/${id}")`;
        } catch { return m; }
      });

      // iframe src / video src 書き換え
      html = html.replace(/<iframe[^>]+src="([^"]+)"/gi, (m, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          const id = generateId();
          urlMap[id] = absoluteUrl;
          return m.replace(url, `/proxy/${id}`);
        } catch { return m; }
      });

      html = html.replace(/<video[^>]+src="([^"]+)"/gi, (m, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          const id = generateId();
          urlMap[id] = absoluteUrl;
          return m.replace(url, `/proxy/${id}`);
        } catch { return m; }
      });

      // Pornhub 動画ページかつ age verification でない場合のみ embed に変換
      if (target.includes('view_video.php?viewkey=') && !html.includes('age_verification')) {
        const idParam = new URL(target).searchParams.get('viewkey');
        const embedUrl = `https://www.pornhub.com/embed/${idParam}`;
        const embedId = generateId();
        urlMap[embedId] = embedUrl;
        html = `<iframe width="640" height="360" src="/proxy/${embedId}" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>`;
      }

      // ヘッダ設定
      res.set('Content-Type', 'text/html; charset=UTF-8');
      res.removeHeader('X-Frame-Options');
      res.set('Content-Security-Policy', '');

      return res.send(html);
    } else {
      // HTML以外はそのままストリーム
      res.set('Content-Type', contentType);

      if (response.body) {
        response.body.pipe(res);
      } else {
        const buffer = await response.arrayBuffer();
        const stream = Readable.from(Buffer.from(buffer));
        stream.pipe(res);
      }
    }
  } catch (e) {
    res.status(500).send('Fetch error: ' + e.message);
  }
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
