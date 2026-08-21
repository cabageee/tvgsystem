const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({ origin: true, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
app.options(/.*/, cors());
app.use(express.json());

const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzWM9qzJfgkoY2RBQ66v9yKOSTl3UeVbN_MkKOPxcqVqKizDYcOjP277mLXGGmgh7dI/exec';

app.post('/api/google-script', async (req, res) => {
  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(req.body)
    });
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

    res.status(response.ok ? 200 : response.status).json(result);
  } catch (error) {
    res.status(502).json({
      status: 'error',
      message: `Không kết nối được Google Apps Script: ${error.message}`
    });
  }
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