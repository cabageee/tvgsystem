const express = require('express');
const cors = require('cors');

const app = express();
const allowedOrigins = new Set(
  String(process.env.TVG_ALLOWED_ORIGINS
    || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);
const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwntHgx-H6pSexW8HFpN3vXSfZZtFflDGg7Cu1nA7qyqKQJTRIl9uN3jXTg4JG8Kn3B/exec';

app.get('/api/health', (req, res) => res.json({ status: 'success', service: 'tvgsystem-api' }));

app.post('/api/google-script', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(req.body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
    const text = await response.text();

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = {
        status: 'error',
        message: text.replace(/<[^>]*>/g, '').trim() || 'Google Apps Script trả về phản hồi không hợp lệ.'
      };
    }

    return res.status(response.ok ? 200 : response.status).json(result);
  } catch (error) {
    return res.status(502).json({
      status: 'error',
      message: `Không kết nối được Google Apps Script: ${error?.message || 'Kết nối bị gián đoạn'}`
    });
  }
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 API phát triển chỉ lắng nghe tại: http://127.0.0.1:${PORT}`);
});