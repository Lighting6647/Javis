export default async function handler(req, res) {
  const text = (req.query.text || '').trim();
  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  try {
    const encoded = encodeURIComponent(text.slice(0, 200));
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encoded}`;

    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return res.status(502).send(`TTS upstream error: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(500).send('TTS Proxy error: ' + err.message);
  }
}
