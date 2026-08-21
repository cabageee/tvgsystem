// File: sync_master.js

// ⚠️ Dán cái link URL ông vừa copy ở BƯỚC 1 vào giữa 2 dấu ngoặc kép này
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxf3thwmCje0EuoGaU1NlZ98PvUBJw2fJbttNR2_PXbtAeAh_tjTmt45OpoCR0Tb2P_/exec";

async function syncMasterData() {
  const btn = document.getElementById('btnSyncMaster');
  if(btn) {
    btn.disabled = true;
    btn.innerText = 'Đang kéo dữ liệu...';
  }

  try {
    const response = await fetch(GOOGLE_SHEET_URL);
    const data = await response.json();

    // Gọi hàm render dữ liệu
    renderTable(data.headers, data.rows);
  } catch (error) {
    alert("Có lỗi khi kéo dữ liệu: " + error);
  } finally {
    if(btn) {
      btn.disabled = false;
      btn.innerText = 'Đồng bộ từ Sheet';
    }
  }
}

function renderTable(headers, rows) {
  const tableHeader = document.getElementById('tableHeader');
  const tableBody = document.getElementById('tableBody');

  if (!tableHeader || !tableBody) {
    console.error("Không tìm thấy ID 'tableHeader' hoặc 'tableBody' trong file HTML!");
    return;
  }

  // Xóa cũ
  tableHeader.innerHTML = '';
  tableBody.innerHTML = '';

  // Vẽ tiêu đề
  let headerHtml = '<tr>';
  headers.forEach(h => headerHtml += `<th>${h}</th>`);
  headerHtml += '</tr>';
  tableHeader.innerHTML = headerHtml;

  // Vẽ dữ liệu
  let bodyHtml = '';
  rows.forEach(row => {
    bodyHtml += '<tr>';
    row.forEach(cell => bodyHtml += `<td>${cell}</td>`);
    bodyHtml += '</tr>';
  });
  tableBody.innerHTML = bodyHtml;
}