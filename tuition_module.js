/**
 * TUITION MODULE - THIÊN VY GLOBAL
 * Độc lập hoàn toàn với index.html
 */

// ================= 1. CẤU HÌNH GÓI HỌC (FLEXIBLE PACKAGES) =================
const TUITION_STORAGE_KEY = 'TV_GLOBAL_TUITION_PACKAGES';

let tuitionPackages = JSON.parse(localStorage.getItem(TUITION_STORAGE_KEY)) || [
  { id: "normal", name: "Lớp thường", sessions: 12 },
  { id: "combo", name: "Combo", sessions: 36 }
];

function saveTuitionPackages() {
  localStorage.setItem(TUITION_STORAGE_KEY, JSON.stringify(tuitionPackages));
}

// ================= 2. THUẬT TOÁN DỊCH CHUYỂN BUỔI (SESSION SHIFT ALGORITHM) =================
/**
 * Tách và dịch chuyển số buổi đã điểm danh gối đầu về đầu chu kỳ mới
 * @param {Array} currentSessions Mảng 40 phần tử biểu diễn B1->B40
 * @param {Number} N Số buổi của gói đã hoàn thành (12 hoặc 36)
 * @returns {Array} Mảng 40 phần tử mới đã shift
 */
function processTuitionRenewal(currentSessions, N) {
  if (!Array.isArray(currentSessions)) {
    currentSessions = Array(40).fill("");
  }

  // 1. Tách các buổi từ N trở đi (index từ N)
  let overflowSessions = currentSessions.slice(N); 
  
  // 2. Lọc bỏ các phần tử rỗng ở cuối để lấy đúng các buổi thực sự đã điểm danh gối đầu
  let remainingAttended = overflowSessions.filter(val => val && String(val).trim() !== "");
  
  // 3. Tạo mảng mới 40 phần tử: Đưa phần gối đầu về đầu mảng, còn lại fill rỗng ""
  let newSessions = [...remainingAttended];
  while (newSessions.length < 40) {
    newSessions.push("");
  }
  
  return newSessions;
}

// ================= 3. STATE CỦA MODAL HỌC PHÍ =================
let activeTuitionStudentIndex = null;

// ================= 4. HIỂN THỊ VÀ XỬ LÝ POP-UP MODAL =================
function openTuitionModal(studentIndex) {
  activeTuitionStudentIndex = studentIndex;
  const student = studentsData[studentIndex];
  if (!student) return;

  // Render thông tin học viên
  document.getElementById('tm-student-id').innerText = student.id || '';
  document.getElementById('tm-student-name').innerText = student.name || '';
  document.getElementById('tm-student-level').innerText = student.level || 'Chưa xếp lớp';
  document.getElementById('tm-student-sessions').innerText = `${student.completedSessions || 0} / 40 buổi`;

  // Dynamic Render danh sách gói học
  const packageSelect = document.getElementById('tm-package-select');
  packageSelect.innerHTML = tuitionPackages.map(pkg => {
    // Mặc định chọn gói tương ứng loại lớp hiện tại
    const isSelected = isComboClass(student.level) ? pkg.sessions > 20 : pkg.sessions <= 20;
    return `<option value="${pkg.id}" data-sessions="${pkg.sessions}" ${isSelected ? 'selected' : ''}>${pkg.name} (${pkg.sessions} buổi)</option>`;
  }).join('');

  // Reset về tab/action mặc định: Đóng học phí gia hạn
  document.getElementById('tm-action-renew').checked = true;
  toggleTuitionActionFields();

  // Hiện Modal
  document.getElementById('modal-tuition-management').classList.remove('hidden');
}

function closeTuitionModal() {
  document.getElementById('modal-tuition-management').classList.add('hidden');
  activeTuitionStudentIndex = null;
}

function toggleTuitionActionFields() {
  const isSwitchClass = document.getElementById('tm-action-switch').checked;
  const switchOptionsGroup = document.getElementById('tm-switch-options-group');
  
  if (isSwitchClass) {
    switchOptionsGroup.classList.remove('hidden');
  } else {
    switchOptionsGroup.classList.add('hidden');
  }
}

// Xử lý Submit từ Modal
async function handleTuitionSubmit(e) {
  e.preventDefault();
  if (activeTuitionStudentIndex === null) return;

  const student = studentsData[activeTuitionStudentIndex];
  const isSwitchClass = document.getElementById('tm-action-switch').checked;
  const selectedPkgOption = document.getElementById('tm-package-select').selectedOptions[0];
  const pkgSessions = parseInt(selectedPkgOption.getAttribute('data-sessions')) || 12;
  const pkgName = selectedPkgOption.text;

  const submitBtn = document.getElementById('tm-btn-submit');
  submitBtn.disabled = true;
  submitBtn.innerText = "⏳ Đang xử lý...";

  try {
    if (!isSwitchClass) {
      // ---------------- TRƯỜNG HỢP 1: ĐÓNG HỌC PHÍ TẮC/GIA HẠN THƯỜNG ----------------
      const newSessions = processTuitionRenewal(student.sessions, pkgSessions);
      
      // Cập nhật Local State
      student.sessions = newSessions;
      student.feeStatus = 'Đã đóng';

      // Gọi API GAS Backend
      await apiCall('renewTuitionSession', {
        studentId: student.id,
        newSessions: newSessions,
        feeStatus: 'Đã đóng'
      });

      alert(`✓ Đã gia hạn học phí thành công cho ${student.name}! Phần điểm danh dư (${pkgSessions} buổi đầu) đã được dồn gối đầu.`);

    } else {
      // ---------------- TRƯỜNG HỢP 2: CHUYỂN ĐỔI LOẠI LỚP ----------------
      const switchScenario = document.querySelector('input[name="tm-switch-scenario"]:checked').value;
      const newLevelName = selectedPkgOption.text.split('(')[0].trim(); // Lấy tên gói làm tên lớp mới

      if (switchScenario === 'scenario_A') {
        // Kịch bản A: Chuyển lớp & Gia hạn ngay (Dồn N buổi của gói MỚI)
        const newSessions = processTuitionRenewal(student.sessions, pkgSessions);
        
        student.level = newLevelName;
        student.sessions = newSessions;
        student.feeStatus = 'Đã đóng';

        await apiCall('switchClassType', {
          studentId: student.id,
          newLevel: newLevelName,
          shouldResetSessions: true,
          newSessions: newSessions
        });

        alert(`✓ Đã chuyển ${student.name} sang lớp "${newLevelName}" và dồn buổi gối đầu chu kỳ mới!`);

      } else {
        // Kịch bản B: Chỉ chuyển loại lớp (Giữ nguyên B1..B40, chỉ đổi level để đổi mốc Cảnh báo)
        student.level = newLevelName;

        await apiCall('switchClassType', {
          studentId: student.id,
          newLevel: newLevelName,
          shouldResetSessions: false
        });

        alert(`✓ Đã chuyển loại lớp của ${student.name} sang "${newLevelName}". Dữ liệu điểm danh giữ nguyên, mốc cảnh báo đã cập nhật.`);
      }
    }

    closeTuitionModal();
    updateAllViews(); // Trigger render lại toàn bộ UI chính

  } catch (err) {
    alert("✕ Thao tác thất bại: " + (err.message || err));
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Xác Nhận Thực Hiện";
  }
}

// ================= 5. QUẢN LÝ DANH SÁCH GÓI HỌC (TRANG CẤU HÌNH LOẠI LỚP) =================
function renderTuitionPackageConfigUI() {
  const container = document.getElementById('tm-package-config-list');
  if (!container) return;

  container.innerHTML = tuitionPackages.map((pkg, idx) => `
    <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
      <div>
        <span class="font-bold text-slate-800 text-xs sm:text-sm">${pkg.name}</span>
        <span class="ml-2 px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-mono font-bold">${pkg.sessions} buổi</span>
      </div>
      <div class="flex gap-2">
        <button onclick="editTuitionPackage(${idx})" class="text-xs text-amber-700 font-semibold hover:underline">Sửa</button>
        <button onclick="deleteTuitionPackage(${idx})" class="text-xs text-red-600 font-semibold hover:underline">Xóa</button>
      </div>
    </div>
  `).join('') || `<p class="text-xs text-slate-400 italic">Chưa có gói học linh hoạt nào.</p>`;
}

function handleAddTuitionPackageSubmit(e) {
  e.preventDefault();
  const nameInput = document.getElementById('tm-pkg-name-input');
  const sessionsInput = document.getElementById('tm-pkg-sessions-input');

  const name = nameInput.value.trim();
  const sessions = parseInt(sessionsInput.value);

  if (!name || isNaN(sessions) || sessions <= 0) {
    alert("⚠️ Vui lòng nhập tên gói và số buổi hợp lệ!");
    return;
  }

  tuitionPackages.push({
    id: `pkg_${Date.now()}`,
    name: name,
    sessions: sessions
  });

  saveTuitionPackages();
  renderTuitionPackageConfigUI();

  nameInput.value = '';
  sessionsInput.value = '';
  alert(`✓ Đã thêm gói học "${name}" (${sessions} buổi)!`);
}

function editTuitionPackage(index) {
  const pkg = tuitionPackages[index];
  if (!pkg) return;

  const newName = prompt("Nhập tên gói học mới:", pkg.name);
  if (newName === null) return;
  const newSessions = prompt("Nhập số buổi cho gói:", pkg.sessions);
  if (newSessions === null) return;

  const parsedSessions = parseInt(newSessions);
  if (!newName.trim() || isNaN(parsedSessions) || parsedSessions <= 0) {
    alert("⚠️ Dữ liệu không hợp lệ!");
    return;
  }

  tuitionPackages[index].name = newName.trim();
  tuitionPackages[index].sessions = parsedSessions;

  saveTuitionPackages();
  renderTuitionPackageConfigUI();
}

function deleteTuitionPackage(index) {
  if (tuitionPackages.length <= 1) {
    alert("⚠️ Hệ thống cần giữ tối thiểu 1 gói học!");
    return;
  }
  if (confirm(`Bạn có chắc muốn xóa gói "${tuitionPackages[index].name}"?`)) {
    tuitionPackages.splice(index, 1);
    saveTuitionPackages();
    renderTuitionPackageConfigUI();
  }
}

// Tự động hook render bảng gói học khi chuyển qua màn hình quản lý loại lớp
document.addEventListener('DOMContentLoaded', () => {
  renderTuitionPackageConfigUI();
});