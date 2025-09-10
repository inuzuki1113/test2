import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

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
    // リダイレクトを自分で制御する
    const response = await fetch(target, { redirect: 'manual' });
    const contentType = response.headers.get('content-type') || '';

    // HTML の場合
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // CSPやX-Frame-Options削除
      html = html.replace(/<meta[^>]*(Content-Security-Policy|X-Frame-Options)[^>]*>/gi, '');
      html = html.replace(/<script[^>]*serviceworker[^>]*>.*?<\/script>/gi, '');
      const baseUrl = new URL(target);

      // href, src, url() をプロキシ経由に書き換え
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

      // iframe src の書き換え（埋め込み動画対応）
      html = html.replace(/<iframe[^>]+src="([^"]+)"/gi, (m, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          return m.replace(url, `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        } catch { return m; }
      });

      // video src の書き換え（埋め込み動画対応）
      html = html.replace(/<video[^>]+src="([^"]+)"/gi, (m, url) => {
        try {
          const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
          return m.replace(url, `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
        } catch { return m; }
      });

      // 本家 viewkey があれば embed に変換
      if (target.includes('view_video.php?viewkey=')) {
        const id = new URL(target).searchParams.get('viewkey');
        const embedUrl = `https://www.pornhub.com/embed/${id}`;
        html = `<iframe width="640" height="360" src="/proxy?url=${encodeURIComponent(embedUrl)}" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>`;
      }

      // ヘッダ書き換え
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
        // node-fetch v3 の場合、body が null のとき
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
