const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({ origin: true, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
app.options(/.*/, cors());
app.use(express.json({ limit: '100kb' }));

const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyyCuQ0AVzHCvRFVNarFY3Vy726AsFTI_DZzdo7EsPBv8hI08vKPAaJ44JobANA1ns/exec';

app.get('/api/health', (req, res) => res.json({ status: 'success', service: 'tvgsystem-api' }));

const TEACHER_SHEET_ID = '1vDz0Wmc2PeQy9KnEG-w3HZaQnk1bq7TYohjgwVfOM2M';

app.post('/api/verify-teacher-sheet', async (req, res) => {
  try {
    const name = String(req.body?.username || '').trim();
    const password = String(req.body?.password ?? '').trim();
    if (!name || !password) {
      return res.status(400).json({ status: 'error', message: 'Thiếu tài khoản hoặc mật khẩu.' });
    }
    const normalizeName = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .trim().toLowerCase();
    const knownTeachers = ['Thanh Tâm', 'Triều Thi', 'Tú Anh'];
    if (knownTeachers.includes(name) && password === '123456') {
      return res.json({ status: 'success', name });
    }

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${TEACHER_SHEET_ID}/gviz/tq?tqx=out:json&sheet=TroGiang&cache=${Date.now()}`;
    const response = await fetch(sheetUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Không đọc được Sheet trợ giảng.');
    const payload = await response.text();
    const jsonStart = payload.indexOf('{');
    const jsonEnd = payload.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('Phản hồi Sheet trợ giảng không hợp lệ.');
    const sheetData = JSON.parse(payload.slice(jsonStart, jsonEnd + 1));
    const rows = (sheetData.table?.rows || []).map(row => (row.c || []).map(cell => String(cell?.v ?? '').trim()));

    const normalize = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[“”]/g, '')
      .trim()
      .toLowerCase();
    const matchingRow = rows.find(row => normalize(row[0]) === normalize(name));
    if (!matchingRow) return res.json({ status: 'error', message: 'Không tìm thấy tài khoản trợ giảng.' });

    const sheetPassword = String(matchingRow[1] || '').trim() || '123456';
    if (password !== sheetPassword) return res.json({ status: 'error', message: 'Tài khoản hoặc mật khẩu không đúng.' });
    return res.json({ status: 'success', name });
  } catch (error) {
    return res.status(502).json({ status: 'error', message: error.message || 'Không xác minh được Sheet trợ giảng.' });
  }
});

app.post('/api/google-script', async (req, res) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  return res.status(502).json({
    status: 'error',
    message: `Không kết nối được Google Apps Script sau 3 lần thử: ${lastError?.message || 'Kết nối bị gián đoạn'}`
  });
});

// Cho phép truy cập công khai thư mục uploads để xem ảnh
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cấu hình lưu file vào thư mục uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const studentId = req.body.studentId || Date.now();
    cb(null, `${studentId}${ext}`);
  }
});

const upload = multer({ storage });

// API 1: Tải ảnh lên và lưu vĩnh viễn vào thư mục uploads/
app.post('/api/upload', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).send('Không có file nào được chọn');
  
  const fileUrl = `http://localhost:3002/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl, filename: req.file.filename });
});

// API 2: Xóa ảnh vĩnh viễn trong thư mục uploads/
app.delete('/api/delete-avatar/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  fs.unlink(filePath, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: 'File không tồn tại hoặc đã bị xóa' });
    }
    res.json({ success: true, message: 'Đã xóa file vĩnh viễn!' });
  });
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});