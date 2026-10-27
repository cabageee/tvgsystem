// ================= CONFIG & GLOBALS =================
    const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzM-2b7qRmgDG1iXBQ_TfTEs5Vpune5U8j-wivC9djnf2xGfYh6Q1msmS98xli8YAK3/exec'; 
    
    let defaultLevelOptions = ['Little Fox L1', 'Little Fox L2', 'Summer', 'Lớp kèm', 'Advance', 'IELTS', 'Full', 'Combo'];
    let customLevelsList = [];

    const STORAGE_KEYS = {
      STUDENTS: 'TV_GLOBAL_STUDENTS_DATA',
      TEACHERS: 'TV_GLOBAL_TEACHERS_DATA',
      INACTIVE: 'TV_GLOBAL_INACTIVE_STUDENTS',
      PASSWORDS: 'TV_GLOBAL_PASSWORDS_DATA',
      LEVELS: 'TV_GLOBAL_CUSTOM_LEVELS'
    };
    const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%23f1f5f9'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%2394a3b8'/%3E%3Cpath d='M10 58c2-12 10-18 22-18s20 6 22 18' fill='%2394a3b8'/%3E%3C/svg%3E";

    function getAvatarDisplayUrl(value) {
      const avatarUrl = String(value || '').trim();
      if (!avatarUrl) return DEFAULT_AVATAR;

      try {
        const parsedUrl = new URL(avatarUrl, window.location.href);
        if (parsedUrl.hostname === 'drive.google.com') {
          const fileId = parsedUrl.pathname.match(/\/file\/d\/([^/]+)/)?.[1]
            || parsedUrl.searchParams.get('id');
          if (fileId) {
            return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w256`;
          }
        }
      } catch (error) {
        console.warn('URL avatar không hợp lệ:', error);
        return DEFAULT_AVATAR;
      }

      return avatarUrl;
    }

    function setAvatarImage(image, value) {
      image.onerror = () => handleAvatarImageError(image);
      image.src = getAvatarDisplayUrl(value);
    }

    function handleAvatarImageError(image) {
      image.onerror = null;
      image.src = DEFAULT_AVATAR;
    }

    let assistantTeachers = [], accountPasswords = { 'director': '123456' }, currentUserRole = null, currentUserName = '';
    let studentsData = [], inactiveStudentsData = [];
    let currentReportStudent = null;
    let activeSessionEditor = null;
    let birthdayNotificationShown = false;
    const attendanceSavingStudentIds = new Set();

    let profileCurrentPage = 1, masterCurrentPage = 1;
    const PAGE_SIZE = 12;
    const MASTER_PAGE_SIZE = 50;

    // Toast thông báo Auto-sync
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      if (!container) return;
      
      const toast = document.createElement('div');
      const bgClass = type === 'success' ? 'bg-slate-900 border-emerald-500 text-white' : 'bg-red-900 border-red-500 text-white';
      const icon = type === 'success' ? '⚡' : '⚠️';
      
      toast.className = `toast-anim flex items-center gap-2 px-4 py-2.5 rounded-xl border-l-4 shadow-xl text-xs font-semibold ${bgClass}`;
      toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
      
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    }

    // Call GAS Backend
    async function apiCall(action, payload = {}) {
      const request = { action, ...payload };

      const isGitHubPages = window.location.hostname.endsWith('github.io');

      if (!isGitHubPages && window.google?.script?.run) {
        return new Promise((resolve, reject) => {
          google.script.run
            .withSuccessHandler((result) => {
              try {
                const parsed = typeof result === 'string' ? JSON.parse(result) : result;
                if (parsed?.status === 'error') {
                  reject(new Error(parsed.message || 'Google Apps Script bị lỗi.'));
                  return;
                }
                resolve(parsed);
              } catch (error) {
                reject(new Error('Phản hồi từ Apps Script không hợp lệ.'));
              }
            })
            .withFailureHandler((error) => {
              reject(new Error(error?.message || 'Google Apps Script bị lỗi.'));
            })
            .handleApiAction(request);
        });
      }

      if (isGitHubPages) {
        return new Promise((resolve, reject) => {
          const callbackName = `tvgApi_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const script = document.createElement('script');
          let timeoutId;
          const cleanup = () => {
            clearTimeout(timeoutId);
            delete window[callbackName];
            script.remove();
          };

          window[callbackName] = (result) => {
            cleanup();
            if (result?.status === 'error') reject(new Error(result.message || 'Google Apps Script bị lỗi.'));
            else resolve(result);
          };
          script.onerror = () => {
            cleanup();
            reject(new Error(`Không nhận được phản hồi từ Apps Script cho thao tác "${action}". Có thể Web app bị lỗi khi chạy, deployment chưa cho phép truy cập công khai, hoặc URL /exec chưa phải bản mới nhất.`));
          };
          script.async = true;
          const query = new URLSearchParams({
            callback: callbackName,
            data: JSON.stringify(request),
            _: String(Date.now())
          });
          script.src = `${GOOGLE_APPS_SCRIPT_URL}?${query.toString()}`;
          timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error(`Apps Script không phản hồi thao tác "${action}" sau 15 giây. Kiểm tra Executed as: Me, Who has access: Anyone và quyền truy cập Google Sheet.`));
          }, 15000);
          document.head.appendChild(script);
        });
      }

      const response = await fetch('http://127.0.0.1:3002/api/google-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const result = await response.json();
      if (!response.ok || result?.status === 'error') {
        throw new Error(result?.message || 'Google Apps Script bị lỗi.');
      }
      return result;
    }

    // Tải dữ liệu từ Google Sheet
    async function fetchDataFromGoogleSheet(isManual = false) {
      const loading = document.getElementById('loading-state');
      if (loading) loading.classList.remove('hidden');

      try {
        const res = await apiCall('getData');

        console.log('Dữ liệu nhận từ Google Apps Script:', res);

        if (!res || res.status !== 'success') {
          throw new Error(res?.message || 'Google Apps Script không trả về success');
        }

        const students = Array.isArray(res.students)
          ? res.students
          : Array.isArray(res.data)
            ? res.data
            : [];

        studentsData = students;
        recalculateCompletedSessions();

        inactiveStudentsData = Array.isArray(res.inactive)
          ? res.inactive
          : [];

        const fetchedTeachers = Array.isArray(res.teachers)
          ? res.teachers
            .map(teacher => {
              if (typeof teacher === 'string') return teacher;
              return teacher?.name || '';
            })
            .filter(Boolean)
          : [];

        if (Array.isArray(res.teachers)) {
          assistantTeachers = fetchedTeachers;
        }

        if (Array.isArray(res.teachers)) {
          res.teachers.forEach(teacher => {
            if (typeof teacher === 'object' && teacher?.name) {
              accountPasswords[teacher.name] = teacher.password || '123456';
            }
          });
        }

        if (Array.isArray(res.levels)) {
          customLevelsList = res.levels;
        } else if (Array.isArray(res.config?.customLevels)) {
          customLevelsList = res.config.customLevels;
        }

        if (res.passwords?.director) {
          accountPasswords.director = res.passwords.director;
        }

        if (res.config?.directorPassword) {
          accountPasswords.director = res.config.directorPassword;
        }

        if (!accountPasswords.director) {
          accountPasswords.director = '123456';
        }

        assistantTeachers.forEach(name => {
          if (name && !accountPasswords[name]) {
            accountPasswords[name] = '123456';
          }
        });

        updateAllViews();

        if (isManual) {
          showToast(`Đã tải ${studentsData.length} học viên từ Google Sheet`);
        }
        return true;
      } catch (err) {
        console.error('Lỗi tải dữ liệu từ Google Sheet:', err);

        if (isManual) {
          showToast(`Không tải được dữ liệu: ${err.message}`, 'error');
        }
        return false;
      } finally {
        if (loading) loading.classList.add('hidden');
        if (!isManual && currentUserRole) showUpcomingBirthdays();
      }
    }

    async function refreshDataAfterMutation() {
      const refreshed = await fetchDataFromGoogleSheet();
      if (!refreshed) {
        showToast('Đã lưu thao tác nhưng chưa tải được dữ liệu mới nhất. Vui lòng thử tải lại Sheet.', 'error');
      }
      return refreshed;
    }

    function fetchAvatarUploadStatus(requestId) {
      return new Promise((resolve, reject) => {
        const callbackName = `tvgAvatarStatus_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement('script');
        const cleanup = () => {
          clearTimeout(timeoutId);
          delete window[callbackName];
          script.remove();
        };
        const timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Không nhận được trạng thái upload từ Apps Script.'));
        }, 10000);

        window[callbackName] = result => {
          cleanup();
          resolve(result);
        };
        script.onerror = () => {
          cleanup();
          reject(new Error('Không truy vấn được trạng thái upload avatar.'));
        };
        const query = new URLSearchParams({
          callback: callbackName,
          avatarRequestId: requestId,
          _: String(Date.now())
        });
        script.async = true;
        script.src = `${GOOGLE_APPS_SCRIPT_URL}?${query.toString()}`;
        document.head.appendChild(script);
      });
    }

    // Upload ảnh qua Google Apps Script để lưu vào Google Drive.
    async function uploadAvatarFile(file) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Ảnh không được vượt quá 5 MB.');
      }

      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
        reader.readAsDataURL(file);
      });
      const requestId = `avatar_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const frameName = `drive-upload-${requestId}`;
      const iframe = document.createElement('iframe');
      iframe.name = frameName;
      iframe.title = 'Tải avatar lên Google Drive';
      iframe.hidden = true;

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = GOOGLE_APPS_SCRIPT_URL;
      form.target = frameName;
      form.hidden = true;
      const fields = {
        requestId,
        fileName: file.name,
        mimeType: file.type,
        dataUrl
      };
      Object.entries(fields).forEach(([name, value]) => {
        const field = document.createElement('input');
        field.type = 'hidden';
        field.name = name;
        field.value = value;
        form.appendChild(field);
      });

      document.body.append(iframe, form);
      try {
        return await new Promise((resolve, reject) => {
          let pollTimer;
          let timeoutId;
          let lastPollError = '';
          let finished = false;
          const finish = (error, url) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeoutId);
            clearTimeout(pollTimer);
            window.removeEventListener('message', onMessage);
            iframe.remove();
            form.remove();
            if (error) reject(error);
            else resolve(url);
          };
          const onMessage = (event) => {
            if (event.source !== iframe.contentWindow || event.data?.requestId !== requestId) return;
            if (event.data.success && event.data.url) finish(null, event.data.url);
            else finish(new Error(event.data.error || 'Google Drive không lưu được ảnh.'));
          };
          const pollStatus = async () => {
            try {
              const result = await fetchAvatarUploadStatus(requestId);
              if (result?.requestId === requestId && result.pending !== true) {
                if (result.success && result.url) finish(null, result.url);
                else finish(new Error(result.error || 'Google Drive không lưu được ảnh.'));
                return;
              }
            } catch (error) {
              lastPollError = error?.message || String(error);
              console.warn('Chưa truy vấn được trạng thái upload avatar:', error);
            }
            if (!finished) pollTimer = setTimeout(pollStatus, 1000);
          };

          timeoutId = setTimeout(() => {
            const detail = lastPollError ? ` ${lastPollError}` : '';
            finish(new Error(`Apps Script không hoàn tất upload avatar sau 60 giây.${detail}`));
          }, 60000);
          window.addEventListener('message', onMessage);
          try {
            form.submit();
            pollTimer = setTimeout(pollStatus, 750);
          } catch (error) {
            finish(error);
          }
        });
      } catch (error) {
        iframe.remove();
        form.remove();
        throw error;
      }
    }

    async function uploadAvatarToDrive(input, target = 'add') {
      const file = input.files[0];
      if (!file) return;

      const targetIds = target === 'edit'
        ? { status: 'edit-upload-status', value: 'edit_avatar', preview: 'edit-avatar-preview' }
        : { status: 'upload-status', value: 'add_avatar', preview: 'avatar-preview' };
      const statusEl = document.getElementById(targetIds.status);
      if (statusEl) statusEl.innerText = "⏳ Đang tải ảnh lên Google Drive...";

      try {
        const avatarUrl = await uploadAvatarFile(file);
        document.getElementById(targetIds.value).value = avatarUrl;
        setAvatarImage(document.getElementById(targetIds.preview), avatarUrl);
        if (statusEl) statusEl.innerText = "✅ Upload ảnh thành công!";
      } catch (err) {
        console.error("Google Drive Upload Error:", err);
        const errorText = err?.message || err?.error_description || String(err);
        if (statusEl) statusEl.innerText = `❌ Upload thất bại: ${errorText}`;
      }
    }

    function openDirectAvatarUpload(studentIdx) {
      const input = document.getElementById('direct-avatar-input');
      input.dataset.studentIndex = String(studentIdx);
      input.value = '';
      input.click();
    }

    async function handleDirectAvatarUpload(input) {
      const student = studentsData[Number(input.dataset.studentIndex)];
      const file = input.files[0];
      if (!file) return;
      if (!student) {
        showToast("Không tìm thấy học viên cần cập nhật avatar.", "error");
        input.value = '';
        return;
      }

      input.disabled = true;
      let uploadedAvatar = '';
      showToast(`Đang tải avatar cho ${student.name} lên Google Drive...`);
      try {
        uploadedAvatar = await uploadAvatarFile(file);
        const result = await apiCall('updateStudentInfo', {
          student: { ...student, avatar: uploadedAvatar }
        });
        if (!result || result.status !== 'success') {
          throw new Error(result?.message || 'Google Sheet không xác nhận cập nhật avatar.');
        }
        student.avatar = uploadedAvatar;
        updateAllViews();
        await refreshDataAfterMutation();
        showToast(`Đã cập nhật avatar học viên ${student.name}`);
      } catch (err) {
        console.error("Google Drive Upload Error:", err);
        const errorText = err?.message || err?.error_description || String(err);
        showToast(
          uploadedAvatar
            ? `Đã tải ảnh lên Drive nhưng chưa lưu được vào Sheet: ${errorText}`
            : `Upload avatar thất bại: ${errorText}`,
          "error"
        );
      } finally {
        input.disabled = false;
        input.value = '';
      }
    }

    function isComboClass(level) {
      if (!level) return false;
      return String(level).toLowerCase().includes('combo');
    }

    function isFeePaid(student) {
      return String(student?.feeStatus || '').trim() === 'Đã đóng';
    }

    function generateNextStudentId(existingList = studentsData) {
      const list = Array.isArray(existingList) ? existingList : [];
      const numbers = list
        .map(student => String(student?.id || '').trim())
        .filter(Boolean)
        .map(id => {
          const match = id.match(/(\d+)(?!.*\d)/);
          return match ? Number(match[1]) : NaN;
        })
        .filter(num => Number.isFinite(num));

      const maxNumber = numbers.length ? Math.max(...numbers) : 0;
      return `HV${String(maxNumber + 1).padStart(3, '0')}`;
    }

    function getWarningConfig(count, level = '') {
      const levelName = String(level).toLowerCase();
      const isCombo = levelName.includes('combo');
      const isFull = levelName.includes('full');

      if (isCombo) {
        if (count >= 30) return { bg: 'bg-red-100', text: 'text-red-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-red-600 text-white rounded">Combo ≥30b (Đỏ)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">⚠️ ${count}b (Đỏ)</span>`, tBg: 'bg-red-50 border-red-500' };
        if (count >= 24) return { bg: 'bg-amber-100', text: 'text-amber-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500 text-white rounded">Combo ≥24b (Vàng)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white">${count}b (Vàng)</span>`, tBg: 'bg-amber-50 border-amber-400' };
        if (count >= 12) return { bg: 'bg-emerald-100', text: 'text-emerald-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-600 text-white rounded">Combo ≥12b (Xanh)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">${count}b (Xanh)</span>`, tBg: 'bg-emerald-50 border-emerald-400' };
      } else if (isFull) {
        if (count >= 22) return { bg: 'bg-red-100', text: 'text-red-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-red-600 text-white rounded">Full ≥22b (Đỏ)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">⚠️ ${count}b (Đỏ)</span>`, tBg: 'bg-red-50 border-red-500' };
        if (count >= 12) return { bg: 'bg-amber-100', text: 'text-amber-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500 text-white rounded">Full ≥12b (Vàng)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white">${count}b (Vàng)</span>`, tBg: 'bg-amber-50 border-amber-400' };
      } else {
        if (count >= 10) return { bg: 'bg-red-100', text: 'text-red-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-red-600 text-white rounded">Thường ≥10b (Đỏ)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">⚠️ ${count}b (Đỏ)</span>`, tBg: 'bg-red-50 border-red-500' };
        if (count >= 6) return { bg: 'bg-amber-100', text: 'text-amber-900', badge: `<span class="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500 text-white rounded">Thường ≥6b (Vàng)</span>`, tBadge: `<span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-white">${count}b (Vàng)</span>`, tBg: 'bg-amber-50 border-amber-400' };
      }
      return { bg: 'bg-white', text: 'text-slate-800', badge: '', tBadge: '', tBg: 'bg-white border-slate-200' };
    }    

    function getProgressWarningPriority(count, level = '') {
      const levelName = String(level).toLowerCase();
      if (levelName.includes('combo')) {
        if (count >= 30) return 3;
        if (count >= 24) return 2;
        if (count >= 12) return 1;
        return 0;
      }
      if (levelName.includes('full')) {
        if (count >= 22) return 3;
        if (count >= 12) return 2;
        return 0;
      }
      if (count >= 10) return 3;
      if (count >= 6) return 2;
      return 0;
    }

    function isStudentOverdue(s) {
      const count = s.completedSessions || 0;
      const levelName = String(s.level || '').toLowerCase();
      if (levelName.includes('combo')) return count >= 30;
      if (levelName.includes('full')) return count >= 22;
      return count >= 10;
    }

    function formatDisplayDate(value) {
      if (!value) return '';

      const text = String(value).trim();

      // yyyy-mm-dd hoặc yyyy/mm/dd
      let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[T\s].*)/);
      if (match) {
        const [, year, month, day] = match;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }

      // dd-mm-yyyy
      match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      if (match) {
        const [, day, month, year] = match;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }

      // dd/mm/yyyy: chuẩn hóa lại số 0
      match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        const [, day, month, year] = match;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }

      return text;
    }

    function formatDateForInput(value) {
      return formatDisplayDate(value);
    }
    function setupDateInput(id, includeYear = true) {
      const input = document.getElementById(id);
      if (!input) return;

      input.addEventListener('input', () => {
        let value = input.value.replace(/\D/g, '').slice(0, includeYear ? 8 : 4);

        if (includeYear && value.length > 4) {
          value = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
        } else if (value.length > 2) {
          value = `${value.slice(0, 2)}/${value.slice(2)}`;
        }

        input.value = value;
      });
    }

    function isValidDateDMY(value) {
      const match = String(value || '').match(
        /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(\d{4})$/
      );

      if (!match) return false;

      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const date = new Date(year, month - 1, day);

      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    }

    function areStudentDatesValid(dob, regDate) {
      if (dob && !isValidDateDMY(dob)) {
        alert('Ngày sinh không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy.');
        return false;
      }
      if (!isValidDateDMY(regDate)) {
        alert('Ngày đăng ký không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy.');
        return false;
      }
      return true;
    }

    function setupAllDateInputs() {
      ['add_dob', 'add_regDate', 'edit_dob', 'edit_regDate', 'director-attendance-date']
        .forEach(id => setupDateInput(id, id !== 'director-attendance-date'));
    }
    function formatShortDate(value) {
      return formatDisplayDate(value);
    }

    function getUpcomingBirthdayDays(value, today = new Date()) {
      const birthday = formatDisplayDate(value);
      const match = birthday.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match || !isValidDateDMY(birthday)) return null;

      const day = Number(match[1]);
      const month = Number(match[2]);
      const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      let birthdayYear = today.getFullYear();
      let birthdayUtc = Date.UTC(birthdayYear, month - 1, day);

      if (birthdayUtc < todayUtc) {
        birthdayYear += 1;
        birthdayUtc = Date.UTC(birthdayYear, month - 1, day);
      }

      const daysUntil = Math.round((birthdayUtc - todayUtc) / 86400000);
      return daysUntil <= 3 ? daysUntil : null;
    }

    function showUpcomingBirthdays() {
      if (!currentUserRole || birthdayNotificationShown || sessionStorage.getItem('TV_GLOBAL_BIRTHDAY_NOTICE_SHOWN') === 'true') return;

      const upcomingBirthdays = studentsData
        .map(student => ({ student, daysUntil: getUpcomingBirthdayDays(student.dob) }))
        .filter(item => item.daysUntil !== null)
        .sort((a, b) => a.daysUntil - b.daysUntil || String(a.student.name || '').localeCompare(String(b.student.name || ''), 'vi'));

      if (!upcomingBirthdays.length) return;

      const list = document.getElementById('birthday-notice-list');
      list.replaceChildren();
      upcomingBirthdays.forEach(({ student, daysUntil }) => {
        const item = document.createElement('li');
        item.className = 'flex items-center justify-between gap-3 py-3';

        const details = document.createElement('div');
        details.className = 'min-w-0';
        const name = document.createElement('p');
        name.className = 'truncate text-sm font-bold text-slate-800';
        name.textContent = student.name || student.id || 'Học viên';
        const birthday = document.createElement('p');
        birthday.className = 'text-xs text-slate-500';
        birthday.textContent = `${formatDisplayDate(student.dob)}${student.level ? ` · ${student.level}` : ''}`;
        details.append(name, birthday);

        const countdown = document.createElement('span');
        countdown.className = 'shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900';
        countdown.textContent = daysUntil === 0 ? 'Hôm nay' : `Còn ${daysUntil} ngày`;
        item.append(details, countdown);
        list.append(item);
      });

      birthdayNotificationShown = true;
      sessionStorage.setItem('TV_GLOBAL_BIRTHDAY_NOTICE_SHOWN', 'true');
      document.getElementById('modal-birthday-notice').classList.remove('hidden');
    }

    function getLocalDateInputValue(date = new Date()) {
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function normalizeAttendanceDate(value) {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}`;
      }

      const text = String(value || '').trim();
      let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (match) {
        const [, year, month, day] = match;
        const date = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        return isValidDateDMY(date) ? date.slice(0, 5) : '';
      }

      match = text.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?(?:$|[T\s].*)/);
      if (!match) return '';

      const [, day, month, year = '2000'] = match;
      const date = `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      return isValidDateDMY(date) ? date.slice(0, 5) : '';
    }

    const SESSION_NOTE_SEPARATOR = '\n[GHI CHÚ]\n';

    function parseSessionEntry(value) {
      if (value instanceof Date) {
        return { date: normalizeAttendanceDate(value), note: '' };
      }

      const text = String(value || '');
      const noteIndex = text.indexOf(SESSION_NOTE_SEPARATOR);
      const date = (noteIndex === -1 ? text : text.slice(0, noteIndex)).trim();
      const note = noteIndex === -1 ? '' : text.slice(noteIndex + SESSION_NOTE_SEPARATOR.length).trim();
      return { date, note };
    }

    function serializeSessionEntry(date, note) {
      const cleanDate = String(date || '').trim();
      const cleanNote = String(note || '').trim();
      if (!cleanNote) return cleanDate;
      return `${cleanDate}${SESSION_NOTE_SEPARATOR}${cleanNote}`;
    }

    function hasRecordedAttendance(value) {
      return Boolean(parseSessionEntry(value).date);
    }

    function getSessionDisplayDate(value) {
      const { date } = parseSessionEntry(value);
      return normalizeAttendanceDate(date) || date;
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]);
    }

    function formatAttendanceDate(inputValue) {
      return normalizeAttendanceDate(inputValue);
    }

    const getFormattedToday = () => {
      const today = new Date();
      return `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
    };

    function hasAttendanceDate(sessions, dateValue) {
      if (!Array.isArray(sessions)) return false;
      const target = normalizeAttendanceDate(dateValue);
      if (!target) return false;
      return sessions.some(value => normalizeAttendanceDate(parseSessionEntry(value).date) === target);
    }

    let confirmResolver = null;
    function showConfirmModal(message) {
      return new Promise((resolve) => {
        confirmResolver = resolve;
        document.getElementById('confirm-modal-text').innerText = message;
        document.getElementById('modal-confirm').classList.remove('hidden');
        document.getElementById('confirm-modal-action-btn').onclick = () => {
          closeModal('modal-confirm');
          if (confirmResolver) confirmResolver(true);
        };
      });
    }

    function closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('hidden');
      if (modalId === 'modal-session-editor') activeSessionEditor = null;
    }

    function openPaymentPopup(studentId) {
      const student = studentsData.find(s => s.id === studentId);
      if (!student) return;

      const studentName = document.getElementById('payment-student-name');
      const classType = document.getElementById('payment-class-type');
      const packageSelect = document.getElementById('payment-package');
      const confirmButton = document.getElementById('btn-confirm-payment');
      const errorMessage = document.getElementById('payment-error-message');
      const paymentModal = document.getElementById('modal-payment');
      if (!studentName || !classType || !packageSelect || !confirmButton || !errorMessage || !paymentModal) {
        showToast('Không thể mở hộp thanh toán: giao diện chưa tải đầy đủ.', 'error');
        return;
      }

      let currentPackageLabel = document.getElementById('payment-current-package');
      if (!currentPackageLabel) {
        const packageRow = document.createElement('p');
        packageRow.className = 'text-sm text-slate-700';
        packageRow.append('Hình thức hiện tại: ');
        currentPackageLabel = document.createElement('strong');
        currentPackageLabel.id = 'payment-current-package';
        currentPackageLabel.className = 'inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800';
        packageRow.appendChild(currentPackageLabel);
        const classTypeRow = classType.closest('p');
        if (classTypeRow) classTypeRow.insertAdjacentElement('afterend', packageRow);
        else packageSelect.parentElement.insertAdjacentElement('beforebegin', packageRow);
      }

      studentName.innerText = student.name;
      classType.innerText = student.level || 'Chưa xếp lớp';
      const levelName = String(student.level || '').toLowerCase();
      const currentPackage = !levelName
        ? 'Chưa xếp lớp'
        : isComboClass(student.level)
          ? 'Combo'
          : levelName.includes('full')
            ? 'Full'
            : 'Lớp thường';
      currentPackageLabel.innerText = currentPackage;
      packageSelect.value = levelName.includes('combo') ? '36' : levelName.includes('full') ? '24' : '12';

      confirmButton.disabled = false;
      confirmButton.innerText = 'Xác nhận thanh toán';
      errorMessage.classList.add('hidden');
      errorMessage.innerText = '';
      confirmButton.onclick = () => processStudentPayment(studentId);
      paymentModal.classList.remove('hidden');
    }

    function openFeeStatusPopup(studentId) {
      const student = studentsData.find(s => s.id === studentId);
      if (!student) return;

      document.getElementById('fee-status-student-name').innerText = student.name;
      document.getElementById('fee-status-value').innerText = isFeePaid(student) ? 'Đã đóng' : 'Chưa đóng';
      document.getElementById('fee-status-level').innerText = student.level || 'Chưa xếp lớp';
      document.getElementById('fee-status-sessions').innerText = `${student.completedSessions || 0} / 40`;
      document.getElementById('fee-status-birthday').innerText = formatDisplayDate(student.dob) || 'Chưa cập nhật';
      document.getElementById('fee-status-reg-date').innerText = formatDisplayDate(student.regDate) || 'Chưa cập nhật';
      document.getElementById('modal-fee-status').classList.remove('hidden');
    }

    async function processStudentPayment(studentId) {
      const student = studentsData.find(s => s.id === studentId);
      const confirmButton = document.getElementById('btn-confirm-payment');
      if (!student || !confirmButton) return;

      const packageSessions = Number(document.getElementById('payment-package').value);
      const errorMessage = document.getElementById('payment-error-message');
      confirmButton.disabled = true;
      confirmButton.innerText = 'Đang xử lý...';

      try {
        const result = await apiCall('processPayment', {
          studentId,
          packageSessions
        });
        if (result?.status !== 'success') throw new Error(result?.message || 'Thanh toán thất bại');

        student.sessions = result.sessions || Array(40).fill('');
        student.feeStatus = 'Đã đóng';
        recalculateCompletedSessions();
        saveAllDataToLocalStorage();
        closeModal('modal-payment');
        await refreshDataAfterMutation();
        showToast(`Đã thanh toán cho ${student.name}`);
      } catch (error) {
        confirmButton.disabled = false;
        confirmButton.innerText = 'Xác nhận thanh toán';
        errorMessage.innerText = `Thanh toán thất bại: ${error.message}`;
        errorMessage.classList.remove('hidden');
        document.getElementById('modal-payment').classList.remove('hidden');
      }
    }

    const APP_PAGE_ROUTES = {
      'page-admin-master': 'index.html',
      'page-student-profiles': 'profiles.html',
      'page-director-list': 'assignments.html',
      'page-director-attendance': 'attendance.html',
      'page-daily-summary': 'daily-summary.html',
      'page-inactive-students': 'inactive-students.html',
      'page-manage-teachers': 'teachers.html',
      'page-manage-levels': 'levels.html',
      'page-teacher-attendance': 'teacher-attendance.html',
      'page-change-password': 'change-password.html'
    };

    function showPage(pageId) {
      if (pageId === 'page-director-attendance' && currentUserRole !== 'director') {
        showToast('Chức năng điểm danh riêng chỉ dành cho giám đốc.', 'error');
        pageId = 'page-teacher-attendance';
      }
      if (currentUserRole !== 'director' && pageId !== 'page-teacher-attendance' && pageId !== 'page-change-password') {
        showToast('Trang này chỉ dành cho giám đốc.', 'error');
        pageId = 'page-teacher-attendance';
      }
      const route = APP_PAGE_ROUTES[pageId];
      if (!route) return;
      if (window.location.pathname.split('/').pop() !== route) {
        window.location.assign(route);
        return;
      }
      const target = document.getElementById(pageId);
      if (target) target.classList.remove('hidden');
      document.querySelectorAll('#admin-nav-buttons button[onclick]').forEach(button => {
        const isCurrentPage = button.getAttribute('onclick') === `showPage('${pageId}')`;
        if (isCurrentPage) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
      sessionStorage.setItem('TV_GLOBAL_PAGE', pageId);
      if (pageId === 'page-director-attendance') renderDirectorAttendance();
    }

    function getAllLevels() {
      const allSet = new Set([...defaultLevelOptions, ...customLevelsList]);
      if (Array.isArray(studentsData)) studentsData.forEach(s => { if (s.level?.trim()) allSet.add(s.level.trim()); });
      if (Array.isArray(inactiveStudentsData)) inactiveStudentsData.forEach(s => { if (s.level?.trim()) allSet.add(s.level.trim()); });
      return Array.from(allSet);
    }

    function saveAllDataToLocalStorage() {
      try {
        localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(studentsData));
        localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(assistantTeachers));
        localStorage.setItem(STORAGE_KEYS.INACTIVE, JSON.stringify(inactiveStudentsData));
        localStorage.setItem(STORAGE_KEYS.PASSWORDS, JSON.stringify(accountPasswords));
        localStorage.setItem(STORAGE_KEYS.LEVELS, JSON.stringify(customLevelsList));
      } catch (e) { console.warn("Lỗi lưu offline:", e); }
    }

    function loadDataFromLocalStorage() {
      try {
        if (localStorage.getItem(STORAGE_KEYS.TEACHERS)) {
          const cachedTeachers = JSON.parse(localStorage.getItem(STORAGE_KEYS.TEACHERS));
          if (Array.isArray(cachedTeachers)) assistantTeachers = cachedTeachers;
        }
        if (localStorage.getItem(STORAGE_KEYS.INACTIVE)) {
          const cachedInactive = JSON.parse(localStorage.getItem(STORAGE_KEYS.INACTIVE));
          if (Array.isArray(cachedInactive)) inactiveStudentsData = cachedInactive;
        }
        if (localStorage.getItem(STORAGE_KEYS.PASSWORDS)) {
          const cachedPasswords = JSON.parse(localStorage.getItem(STORAGE_KEYS.PASSWORDS));
          if (cachedPasswords && typeof cachedPasswords === 'object') {
            accountPasswords = { ...{ director: '123456' }, ...cachedPasswords };
          }
        }
        if (localStorage.getItem(STORAGE_KEYS.LEVELS)) {
          const cachedLevels = JSON.parse(localStorage.getItem(STORAGE_KEYS.LEVELS));
          if (Array.isArray(cachedLevels)) customLevelsList = cachedLevels;
        }
        if (localStorage.getItem(STORAGE_KEYS.STUDENTS)) {
          const cachedStudents = JSON.parse(localStorage.getItem(STORAGE_KEYS.STUDENTS));
          if (Array.isArray(cachedStudents)) {
            studentsData = cachedStudents;
            recalculateCompletedSessions();
            return true;
          }
        }
        if (!accountPasswords.director) accountPasswords.director = '123456';
        assistantTeachers.forEach(name => {
          if (name && !accountPasswords[name]) accountPasswords[name] = '123456';
        });
      } catch (e) { console.error(e); }
      return false;
    }

    function recalculateCompletedSessions() {
      studentsData.forEach(s => {
        if (!Array.isArray(s.sessions)) s.sessions = Array(40).fill("");
        s.sessions = s.sessions.map(value => {
          const entry = parseSessionEntry(value);
          return serializeSessionEntry(normalizeAttendanceDate(entry.date) || entry.date, entry.note);
        });
        s.assistants = normalizeAssistants(s.assistants);
        s.completedSessions = s.sessions.filter(hasRecordedAttendance).length;
      });
    }

    function normalizeAssistants(value) {
      const values = Array.isArray(value)
        ? value
        : String(value || '').split(',');

      return values
        .map(item => String(item).trim())
        .filter(item => item && !/^https?:\/\//i.test(item));
    }

    function updateAllViews() {
      recalculateCompletedSessions();
      saveAllDataToLocalStorage();
      populateTeacherFilterSelects();
      populateAllLevelDropdowns();
      renderDirectorTable();
      renderTeacherCards();
      renderDailySummaryCards();
      renderDirectorAttendance();
      renderStudentProfileCards();
      renderMasterPage();
      renderInactiveStudentsTable();
      renderTeacherManagementPage();
      renderLevelManagementPage();
      initLoginTeacherList();
    }

    function populateTeacherFilterSelects() {
      ['profile-filter-teacher', 'master-filter-teacher', 'director-filter-teacher'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = `<option value="">-- Tất cả Trợ giảng --</option><option value="__UNASSIGNED__" ${currentVal === '__UNASSIGNED__' ? 'selected' : ''}>-- Chưa phân công --</option>` + assistantTeachers.map(t => `<option value="${t}" ${currentVal === t ? 'selected' : ''}>${t}</option>`).join('');
      });
    }

    function populateAllLevelDropdowns() {
      const levels = getAllLevels();
      ['add_level', 'edit_level', 'profile-filter-level', 'master-filter-level', 'director-filter-level'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        const defaultText = id.includes('filter') ? '-- Tất cả Cấp độ / Loại Lớp --' : '-- Chọn Cấp Độ / Loại Lớp --';
        el.innerHTML = `<option value="">${defaultText}</option>` + levels.map(l => `<option value="${l}" ${currentVal === l ? 'selected' : ''}>${l}</option>`).join('');
      });
    }

    function renderLevelSelectHtml(currentLevel, onChangeFnString) {
      const allLevels = getAllLevels();
      let optionsHtml = allLevels.map(lvl => `<option value="${lvl}" ${currentLevel === lvl ? 'selected' : ''}>${lvl}</option>`).join('');
      return `<select onchange="${onChangeFnString}" class="text-xs font-semibold bg-white border border-slate-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-[#8B1515] text-slate-800 cursor-pointer w-full">${optionsHtml}</select>`;
    }

    // Cập nhật Cấp độ Auto-sync lên Sheet
    async function updateStudentLevel(studentIndex, newLevel) {
      const student = studentsData[studentIndex];
      if (!student) return;
      student.level = newLevel;
      updateAllViews();
      showToast(`Đã đổi cấp độ cho ${student.name}`);

      try {
        await apiCall('update_level', { studentId: student.id, level: newLevel });
        await refreshDataAfterMutation();
      } catch (e) {
        showToast("✕ Lỗi đồng bộ Google Sheet", "error");
      }
    }

    async function persistStudentSessionValue(studentIdx, sessionIdx, value) {
      const student = studentsData[studentIdx];
      if (!student) return false;
      if (!Array.isArray(student.sessions)) student.sessions = Array(40).fill("");
      const previousValue = student.sessions[sessionIdx] || '';
      student.sessions[sessionIdx] = value;
      recalculateCompletedSessions();
      saveAllDataToLocalStorage();
      updateAllViews();

      try {
        const result = await apiCall('updateAttendance', {
          studentId: student.id,
          sessionIndex: sessionIdx + 1,
          value
        });
        if (result?.status !== 'success') throw new Error(result?.message || 'Google Sheet không xác nhận lưu điểm danh.');
        const refreshed = await refreshDataAfterMutation();
        if (refreshed) showToast(`Đã lưu Buổi ${sessionIdx + 1} cho ${student.name}`);
        return true;
      } catch (error) {
        student.sessions[sessionIdx] = previousValue;
        recalculateCompletedSessions();
        saveAllDataToLocalStorage();
        updateAllViews();
        showToast(`Không lưu được điểm danh: ${error.message}`, 'error');
        return false;
      }
    }

    // Master View hiển thị giá trị buổi; thao tác sửa được thực hiện trong hộp chỉnh sửa.
    async function updateMasterSession(studentIdx, sessionIdx, value) {
      const student = studentsData[studentIdx];
      if (!student) return;
      const existing = parseSessionEntry(student.sessions?.[sessionIdx]);
      const nextDate = normalizeAttendanceDate(value) || String(value || '').trim();
      await persistStudentSessionValue(studentIdx, sessionIdx, serializeSessionEntry(nextDate, existing.note));
    }

    function openSessionEditor(studentIdx, sessionIdx) {
      const student = studentsData[studentIdx];
      if (!student || !Number.isInteger(sessionIdx) || sessionIdx < 0 || sessionIdx >= 40) return;

      const entry = parseSessionEntry(student.sessions?.[sessionIdx]);
      activeSessionEditor = { studentIdx, sessionIdx };
      document.getElementById('session-editor-student').textContent = student.name || student.id || 'Học viên';
      document.getElementById('session-editor-session').textContent = `Buổi ${sessionIdx + 1} · ${student.level || 'Chưa xếp lớp'}`;
      document.getElementById('session-editor-date').value = normalizeAttendanceDate(entry.date) || entry.date;
      document.getElementById('session-editor-note').value = entry.note;
      const errorMessage = document.getElementById('session-editor-error');
      errorMessage.textContent = '';
      errorMessage.classList.add('hidden');
      document.getElementById('modal-session-editor').classList.remove('hidden');
    }

    async function saveSessionEditor(event) {
      event.preventDefault();
      if (!activeSessionEditor) return;

      const dateInput = document.getElementById('session-editor-date');
      const dateValue = dateInput.value.trim();
      const normalizedDate = normalizeAttendanceDate(dateValue);
      const errorMessage = document.getElementById('session-editor-error');
      if (dateValue && !normalizedDate) {
        errorMessage.textContent = 'Ngày không hợp lệ. Nhập theo định dạng dd/mm hoặc dd/mm/yyyy.';
        errorMessage.classList.remove('hidden');
        dateInput.focus();
        return;
      }

      const { studentIdx, sessionIdx } = activeSessionEditor;
      const student = studentsData[studentIdx];
      if (!student) return;
      const note = document.getElementById('session-editor-note').value.trim();
      const saveButton = document.getElementById('session-editor-save');
      saveButton.disabled = true;
      saveButton.textContent = 'Đang lưu...';
      errorMessage.textContent = '';
      errorMessage.classList.add('hidden');

      try {
        const saved = await persistStudentSessionValue(
          studentIdx,
          sessionIdx,
          serializeSessionEntry(normalizedDate, note)
        );
        if (!saved) {
          errorMessage.textContent = 'Không lưu được thay đổi. Vui lòng kiểm tra kết nối và thử lại.';
          errorMessage.classList.remove('hidden');
          return;
        }

        closeModal('modal-session-editor');
        activeSessionEditor = null;
        if (document.getElementById('modal-teacher-student-details')?.classList.contains('hidden') === false) {
          openTeacherStudentDetails(student.id);
        }
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Lưu thay đổi';
      }
    }

    function updateAttendance(studentId, sessionIndex, value) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const studentSheet = ss.getSheetByName(TAB.STUDENTS);
      const attendanceSheet = ss.getSheetByName(TAB.ATTENDANCE);

      if (!studentSheet || !attendanceSheet) {
        return {
          status: 'error',
          message: 'Thiếu tab ThongTinHocSinh hoặc DiemDanh'
        };
      }

      const studentData = studentSheet.getDataRange().getValues();
      const studentIdText = String(studentId || '').trim();

      let studentInfo = null;

      for (let i = 1; i < studentData.length; i++) {
        if (String(studentData[i][0]).trim() === studentIdText) {
          studentInfo = studentData[i];
          break;
        }
      }

      if (!studentInfo) {
        return {
          status: 'error',
          message: 'Không tìm thấy học viên trong ThongTinHocSinh'
        };
      }

      const sessionNumber = Number(sessionIndex);

      // sessionIndex phải có giá trị từ 1 đến 40.
      // Buổi 1 nằm ở cột D, buổi 40 nằm ở cột AQ.
      if (
        !Number.isInteger(sessionNumber) ||
        sessionNumber < 1 ||
        sessionNumber > 40
      ) {
        return {
          status: 'error',
          message: 'Số buổi học không hợp lệ: ' + sessionIndex
        };
      }

      const attendanceData = attendanceSheet.getDataRange().getValues();
      let attendanceRow = -1;

      for (let i = 1; i < attendanceData.length; i++) {
        if (String(attendanceData[i][0]).trim() === studentIdText) {
          attendanceRow = i + 1;
          break;
        }
      }

      // Nếu học viên chưa có dòng trong DiemDanh thì tạo dòng mới.
      if (attendanceRow === -1) {
        const attendanceRowData = [
          studentInfo[0],  // Mã học viên
          studentInfo[1],  // Họ tên
          studentInfo[5],  // Ngày đăng ký
          ...Array(40).fill('')
        ];

        attendanceSheet.appendRow(attendanceRowData);
        attendanceRow = attendanceSheet.getLastRow();
      } else {
        // Luôn đồng bộ mã học viên, tên và ngày đăng ký.
        attendanceSheet
          .getRange(attendanceRow, 1, 1, 3)
          .setValues([[
            studentInfo[0],
            studentInfo[1],
            studentInfo[5]
          ]]);
      }

      // Cột D là buổi 1 nên cột cần cập nhật = sessionNumber + 3.
      const targetColumn = sessionNumber + 3;

      const sessionEntry = parseSessionEntry(value);
      const attendanceValue = serializeSessionEntry(
        normalizeAttendanceDate(sessionEntry.date) || sessionEntry.date,
        sessionEntry.note
      );
      attendanceSheet
        .getRange(attendanceRow, targetColumn)
        .setValue(attendanceValue);

      return {
        status: 'success',
        message: 'Đã cập nhật điểm danh và thông tin học viên'
      };
    }
    // Quick Điểm Danh Hôm Nay trên Master View
    async function quickMasterAttendanceToday(studentIdx, sessionIdx) {
      const student = studentsData[studentIdx];
      if (!student) return;
      const today = getFormattedToday();
      if (currentUserRole !== 'director' && hasAttendanceDate(student.sessions, today)) {
        showToast(`${student.name} đã được điểm danh hôm nay`, 'error');
        return;
      }
      const currentVal = student.sessions[sessionIdx] || '';
      const newVal = hasAttendanceDate([currentVal], today) ? '' : today;
      await updateMasterSession(studentIdx, sessionIdx, newVal);
      if (currentUserRole !== 'director') renderTeacherCards();
    }

    // RENDER TAB MASTER VIEW
    function renderMasterPage() {
      const tbody = document.getElementById('master-table-body');
      const thead = document.getElementById('tableHeader');
      if (!tbody || !thead) return;

      let filtered = getMasterFilteredStudents();

            // --- SẮP XẾP ƯU TIÊN (Đỏ -> Vàng -> Xanh) ---
            filtered.sort((a, b) => {
              const getScore = (s) => {
                const count = s.sessions ? s.sessions.filter(hasRecordedAttendance).length : (s.completedSessions || 0);
                const levelName = s.level ? s.level.toLowerCase() : "";
                
                if (levelName.includes("combo")) {
                  if (count >= 30) return 4; // Đỏ
                  if (count >= 24) return 3; // Vàng
                  if (count >= 12) return 2; // Xanh
                  return 1;
                } else if (levelName.includes("full")) {
                  if (count >= 22) return 4; // Đỏ
                  if (count >= 12) return 3; // Vàng
                  return 1;
                } else {
                  if (count >= 10) return 4; // Đỏ
                  if (count >= 6) return 3;  // Vàng
                  return 1;
                }
              };
              return getScore(b) - getScore(a); 
            });
            // ---------------------------------------------            // ---------------------------------------------

      const statTotal = document.getElementById('stat-total-students');
      if (statTotal) statTotal.innerText = studentsData.length;
      const statUnassigned = document.getElementById('stat-unassigned-assistants');
      if (statUnassigned) statUnassigned.innerText = studentsData.filter(s => !s.assistants || s.assistants.length === 0).length;
      const statOverdue = document.getElementById('stat-overdue-students');
      if (statOverdue) statOverdue.innerText = studentsData.filter(s => isStudentOverdue(s)).length;
      const statInactive = document.getElementById('stat-inactive-students');
      if (statInactive) statInactive.innerText = inactiveStudentsData.length;

      let headerHtml = `
        <tr class="text-slate-700 font-bold uppercase text-[10px] sm:text-xs tracking-wider border-b">
          <th class="p-2.5 border-r border-slate-300 w-16 text-center sticky-col-1">Mã</th>
          <th class="p-2.5 border-r border-slate-300 w-80 sticky-col-2">Họ Và Tên Học Viên</th>
          <th class="p-2.5 border-r border-slate-300 w-32 text-center">Cấp Độ Lớp</th>
          <th class="p-2.5 border-r border-slate-300 w-24 text-center">Đã Học</th>
          <th class="p-2.5 border-r border-slate-300 w-28 text-center">Ngày ĐK</th>`;
      
      for (let i = 1; i <= 40; i++) {
        headerHtml += `<th class="p-2 border-r border-slate-300 w-20 text-center bg-slate-200/80 font-mono text-[11px]">B${i}</th>`;
      }
      headerHtml += `</tr>`;
      thead.innerHTML = headerHtml;

      const totalPages = Math.ceil(filtered.length / MASTER_PAGE_SIZE) || 1;
      if (masterCurrentPage > totalPages) masterCurrentPage = totalPages;
      const startIdx = (masterCurrentPage - 1) * MASTER_PAGE_SIZE;
      const pagedList = filtered.slice(startIdx, startIdx + MASTER_PAGE_SIZE);

      if (!pagedList.length) {
        tbody.innerHTML = `<tr><td colspan="45" class="p-8 text-center text-slate-400 italic font-medium">Không tìm thấy học viên nào phù hợp.</td></tr>`;
        return;
      }

      tbody.innerHTML = pagedList.map(s => {
        const globalIdx = studentsData.findIndex(st => st.id === s.id);
        const warn = getWarningConfig(s.completedSessions, s.level);

        let rowHtml = `
          <tr class="hover:bg-slate-50 border-b border-slate-200 transition-colors">
            <td class="p-2 text-center font-bold text-[#8B1515] font-mono sticky-col-1 border-r border-slate-200">${s.id}</td>
            <td class="p-2 sticky-col-2 border-r border-slate-200">
              <div class="flex items-center gap-2">
                <div class="relative shrink-0">
                  <img src="${getAvatarDisplayUrl(s.avatar)}" onerror="handleAvatarImageError(this)" alt="Avatar ${s.name}" class="w-24 h-24 rounded-full object-cover border-2 border-amber-300 shadow-sm">
                  <button type="button" onclick="openDirectAvatarUpload(${globalIdx})" aria-label="Đổi avatar ${s.name}" title="Đổi avatar" class="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-white border border-slate-200 text-[#8B1515] shadow flex items-center justify-center text-xs hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#8B1515]">📷</button>
                </div>
                <div class="truncate">
                  <div class="font-bold text-slate-800 text-xs truncate" title="${s.name}">${s.name}</div>
                  ${warn.badge ? `<div class="mt-0.5">${warn.badge}</div>` : ''}
                </div>
              </div>
            </td>
            <td class="p-1.5 border-r border-slate-200 text-center">
              ${renderLevelSelectHtml(s.level, `updateStudentLevel(${globalIdx}, this.value)`)}
            </td>
            <td class="p-2 text-center border-r border-slate-200 font-bold ${warn.bg} ${warn.text} font-mono">
              ${s.completedSessions || 0} / 40
            </td>
            <td class="p-2 text-center border-r border-slate-200 text-slate-500 font-mono text-[11px]">
              ${s.regDate || '---'}
            </td>`;

        for (let b = 0; b < 40; b++) {
          const val = (s.sessions && s.sessions[b]) ? s.sessions[b] : '';
          const entry = parseSessionEntry(val);
          const displayDate = getSessionDisplayDate(val);
          const hasAttendance = hasRecordedAttendance(val);
          const cellBg = hasAttendance ? 'bg-emerald-50 text-emerald-800 font-bold border-emerald-300' : 'bg-white text-slate-400 hover:bg-slate-100';

          rowHtml += `
            <td class="p-1 border-r border-slate-200 text-center">
              <button type="button" onclick="openSessionEditor(${globalIdx}, ${b})"
                title="Chỉnh sửa Buổi ${b + 1}${entry.note ? ' · Có ghi chú' : ''}"
                aria-label="Chỉnh sửa Buổi ${b + 1}"
                class="w-full min-h-7 text-center text-[11px] font-mono py-1 rounded border outline-none transition ${cellBg}">
                ${displayDate ? escapeHtml(displayDate) : '--'}${entry.note ? ' 📝' : ''}
              </button>
            </td>`;
        }

        rowHtml += `</tr>`;
        return rowHtml;
      }).join('');

      const controls = document.getElementById('master-pagination-controls');
      if (controls) {
        controls.innerHTML = `
          <span class="text-slate-500 font-medium">Hiển thị ${startIdx + 1} - ${Math.min(startIdx + MASTER_PAGE_SIZE, filtered.length)} / <strong>${filtered.length}</strong> học viên</span>
          <div class="flex gap-1.5">
            <button onclick="masterCurrentPage--; renderMasterPage();" ${masterCurrentPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold text-slate-700">Trang trước</button>
            <span class="px-3 py-1.5 bg-slate-200 rounded-lg font-mono font-bold text-slate-800">${masterCurrentPage} / ${totalPages}</span>
            <button onclick="masterCurrentPage++; renderMasterPage();" ${masterCurrentPage === totalPages ? 'disabled' : ''} class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold text-slate-700">Trang sau</button>
          </div>`;
      }
    }

    function filterMasterData() {
      masterCurrentPage = 1;
      renderMasterPage();
    }

    function getMasterFilteredStudents() {
      const searchKey = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
      const levelFilter = document.getElementById('master-filter-level')?.value || '';
      const teacherFilter = document.getElementById('master-filter-teacher')?.value || '';

      return studentsData.filter(s => {
        const searchableText = [
          s.id || '',
          s.name || '',
          s.parentName || '',
          s.parentPhone || s.phone || '',
          normalizeAssistants(s.assistants).join(' ')
        ].join(' ').toLowerCase();
        const matchSearch = !searchKey || searchableText.includes(searchKey);
        const matchLevel = !levelFilter || s.level === levelFilter;
        const assistants = normalizeAssistants(s.assistants);
        const matchTeacher = !teacherFilter
          || (teacherFilter === '__UNASSIGNED__' ? assistants.length === 0 : assistants.includes(teacherFilter));
        return matchSearch && matchLevel && matchTeacher;
      });
    }

    // Xuất Excel 40 buổi
    function exportAttendanceExcel() {
      const filteredStudents = getMasterFilteredStudents();
      if (!filteredStudents.length) return alert("⚠️ Không có học viên nào phù hợp với bộ lọc để xuất Excel!");
      
      const exportData = filteredStudents.map((s, idx) => {
        const row = {
          "STT": idx + 1,
          "Mã Học Viên": s.id,
          "Họ Và Tên": s.name,
          "Cấp Độ / Loại Lớp": s.level || '',
          "Ngày Đăng Ký": s.regDate || '',
          "Tổng Buổi Đã Học": s.completedSessions || 0,
          "Phụ Huynh": s.parentName || '',
          "Số Điện Thoại": s.parentPhone || s.phone || '',
          "Trợ Giảng Phụ Trách": (s.assistants || []).join(', ')
        };
        for (let b = 1; b <= 40; b++) {
          row[`Buổi ${b}`] = s.sessions ? (s.sessions[b - 1] || '') : '';
        }
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "DiemDanh_40Buoi");
      XLSX.writeFile(workbook, `ThienVyGlobal_DiemDanh_${getFormattedToday().replace(/\//g, '-')}.xlsx`);
    }

    // Quản lý HV nghỉ học
    function renderInactiveStudentsTable() {
      const tbody = document.getElementById('inactive-table-body');
      if (!tbody) return;

      if (!inactiveStudentsData.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 italic">Chưa có học viên nào nghỉ học.</td></tr>`;
        return;
      }

      tbody.innerHTML = inactiveStudentsData.map((s, idx) => `
        <tr class="hover:bg-slate-50 border-b">
          <td class="p-3 text-center font-bold text-slate-400">${idx + 1}</td>
          <td class="p-3 text-center font-mono font-bold text-[#8B1515]">${s.id}</td>
          <td class="p-3 font-bold text-slate-800">${s.name}</td>
          <td class="p-3 text-slate-600">${s.parentName || '---'}</td>
          <td class="p-3 text-slate-600 font-mono">${s.phone || s.parentPhone || '---'}</td>
          <td class="p-3 text-center text-slate-500 font-mono">${s.regDate || '---'}</td>
          <td class="p-3 text-slate-600 italic">${s.note || 'Không có lý do'}</td>
          <td class="p-3 text-center">
            <button onclick="restoreInactiveStudent(${idx})" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-xs shadow">Khôi phục</button>
          </td>
        </tr>`).join('');
    }

    async function restoreInactiveStudent(inactiveIdx) {
      const student = inactiveStudentsData[inactiveIdx];
      if (!student) return;
      const confirmOk = await showConfirmModal(`Khôi phục học viên "${student.name}" trở lại danh sách đang học?`);
      if (!confirmOk) return;

      const restoredStudent = {
        ...student,
        id: String(student.id || '').trim(),
        assistants: normalizeAssistants(student.assistants),
        sessions: Array.isArray(student.sessions) ? student.sessions.slice(0, 40).concat(Array(40).fill('')).slice(0, 40) : Array(40).fill(''),
        completedSessions: 0,
        feeStatus: String(student.feeStatus || 'Chưa đóng').trim() || 'Chưa đóng'
      };
      restoredStudent.sessions = restoredStudent.sessions.map(value => {
        const entry = parseSessionEntry(value);
        return serializeSessionEntry(normalizeAttendanceDate(entry.date) || entry.date, entry.note);
      });

      if (!restoredStudent.id) {
        showToast('Không thể khôi phục vì thiếu mã học viên.', 'error');
        return;
      }

      inactiveStudentsData.splice(inactiveIdx, 1);
      studentsData.push(restoredStudent);
      saveAllDataToLocalStorage();
      updateAllViews();
      showToast(`Đã khôi phục học viên ${student.name}`);

      try {
        const result = await apiCall('restoreStudent', { student: restoredStudent });
        if (result?.status !== 'success') throw new Error(result?.message || 'Khôi phục lên Sheet thất bại');
        await refreshDataAfterMutation();
      } catch (err) {
        showToast(`✕ Lỗi đồng bộ khôi phục lên Sheet: ${err.message}`, 'error');
      }
    }

    async function deleteStudent(studentIdx) {
      const student = studentsData[studentIdx];
      if (!student) return;
      const confirmOk = await showConfirmModal(`Chuyển học viên "${student.name}" sang danh sách Nghỉ Học?`);
      if (!confirmOk) return;

      studentsData.splice(studentIdx, 1);
      inactiveStudentsData.push({
        stt: inactiveStudentsData.length + 1,
        id: student.id,
        name: student.name,
        parentName: student.parentName,
        phone: student.parentPhone || student.phone,
        regDate: student.regDate,
        note: student.note || 'Nghỉ học'
      });

      updateAllViews();
      showToast(`Đã chuyển ${student.name} sang tab Nghỉ Học`);

      try {
        await apiCall('moveToInactive', {
          studentId: student.id,
          reason: student.note || 'Đã dừng học'
        });
        await refreshDataAfterMutation();
      } catch (e) {
        showToast("Lỗi đồng bộ xóa lên Sheet!", "error");
      }
    }

    // Modal Form Học viên
    function openAddStudentModal() {
      const nextStudentId = generateNextStudentId();
      document.getElementById('add_id').value = nextStudentId;
      document.getElementById('add_name').value = '';
      document.getElementById('add_dob').value = '';
      const today = new Date();
      document.getElementById('add_regDate').value =
        `${String(today.getDate()).padStart(2, '0')}/` +
        `${String(today.getMonth() + 1).padStart(2, '0')}/` +
        `${today.getFullYear()}`;
      document.getElementById('add_parentName').value = '';
      document.getElementById('add_parentPhone').value = '';
      document.getElementById('add_address').value = '';
      document.getElementById('add_note').value = '';
      document.getElementById('add_avatar').value = '';
      setAvatarImage(document.getElementById('avatar-preview'), '');
      document.getElementById('add_avatar_file').value = '';
      document.getElementById('upload-status').innerText = 'Chọn ảnh để upload tự động.';
      document.getElementById('modal-add-student').classList.remove('hidden');
    }

    async function handleAddStudentSubmit(e) {
      e.preventDefault();
      const dob = document.getElementById('add_dob').value.trim();
      const regDate = document.getElementById('add_regDate').value.trim();
      if (!areStudentDatesValid(dob, regDate)) return;

      let customId = document.getElementById('add_id').value.trim();
      if (!customId) {
        customId = generateNextStudentId();
      }

      if (studentsData.some(s => s.id === customId)) {
        return alert("⚠️ Mã học viên này đã tồn tại!");
      }

      const newStudent = {
        id: customId,
        name: document.getElementById('add_name').value.trim(),
        dob: formatShortDate(dob),
        gender: document.getElementById('add_gender').value,
        level: document.getElementById('add_level').value,
        regDate: formatShortDate(regDate),
        parentName: document.getElementById('add_parentName').value.trim(),
        parentPhone: document.getElementById('add_parentPhone').value.trim(),
        address: document.getElementById('add_address').value.trim(),
        feeStatus: document.getElementById('add_feeStatus').value,
        note: document.getElementById('add_note').value.trim(),
        avatar: document.getElementById('add_avatar').value || DEFAULT_AVATAR,
        assistants: [],
        sessions: Array(40).fill(""),
        completedSessions: 0
      };

      studentsData.push(newStudent);
      closeModal('modal-add-student');
      updateAllViews();
      showToast(`Đã thêm thành công học viên ${newStudent.name}`);

      try {
        await apiCall('addStudent', { student: newStudent });
        await refreshDataAfterMutation();
      } catch (err) {
        showToast("✕ Lỗi đồng bộ lên Sheet!", "error");
      }
    }

    function openEditStudentModal(idx) {
      const student = studentsData[idx];
      if (!student) return;

      document.getElementById('edit_id').value = student.id;
      document.getElementById('edit_id_display').value = student.id;
      document.getElementById('edit_name').value = student.name;
      document.getElementById('edit_dob').value =  formatDateForInput(student.dob);
      document.getElementById('edit_gender').value = student.gender || 'Nam';
      document.getElementById('edit_level').value = student.level || '';
      document.getElementById('edit_regDate').value = formatDateForInput(student.regDate);
      document.getElementById('edit_parentName').value = student.parentName || '';
      document.getElementById('edit_parentPhone').value = student.parentPhone || student.phone || '';
      document.getElementById('edit_feeStatus').value = student.feeStatus || 'Chưa đóng';
      document.getElementById('edit_address').value = student.address || '';
      document.getElementById('edit_note').value = student.note || '';
      document.getElementById('edit_avatar').value = student.avatar || '';
      setAvatarImage(document.getElementById('edit-avatar-preview'), student.avatar);
      document.getElementById('edit_avatar_file').value = '';
      document.getElementById('edit-upload-status').innerText = student.avatar ? 'Đang dùng avatar hiện tại. Chọn ảnh mới để thay.' : 'Chọn ảnh để upload tự động.';

      document.getElementById('modal-edit-student').classList.remove('hidden');
    }

    async function handleEditStudentSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('edit_id').value;
      const student = studentsData.find(s => s.id === id);
      if (!student) return;

      const dob = document.getElementById('edit_dob').value.trim();
      const regDate = document.getElementById('edit_regDate').value.trim();
      if (!areStudentDatesValid(dob, regDate)) return;

      student.name = document.getElementById('edit_name').value.trim();
      student.dob = formatShortDate(dob);
      student.gender = document.getElementById('edit_gender').value;
      student.level = document.getElementById('edit_level').value;
      student.regDate = formatShortDate(regDate);
      student.parentName = document.getElementById('edit_parentName').value.trim();
      student.parentPhone = document.getElementById('edit_parentPhone').value.trim();
      student.feeStatus = document.getElementById('edit_feeStatus').value;
      student.address = document.getElementById('edit_address').value.trim();
      student.note = document.getElementById('edit_note').value.trim();
      student.avatar = document.getElementById('edit_avatar').value || DEFAULT_AVATAR;

      closeModal('modal-edit-student');
      updateAllViews();
      showToast(`Đã cập nhật học viên ${student.name}`);

      try {
        await apiCall('updateStudentInfo', { student });
        await refreshDataAfterMutation();
      } catch (err) {
        showToast("✕ Lỗi đồng bộ Google Sheet", "error");
      }
    }

    function renderDirectorTable() {
      const tbody = document.getElementById('director-table-body');
      if (!tbody) return;

      const searchKey = (document.getElementById('director-search-input')?.value || '').toLowerCase().trim();
      const levelFilter = document.getElementById('director-filter-level')?.value || '';
      const teacherFilter = document.getElementById('director-filter-teacher')?.value || '';
      const assignedCount = studentsData.filter(student => normalizeAssistants(student.assistants).length > 0).length;
      const unassignedCount = studentsData.length - assignedCount;
      const filteredStudents = studentsData
        .map((student, idx) => ({ student, idx }))
        .filter(({ student }) => {
          const assistants = normalizeAssistants(student.assistants);
          const searchableText = [
            student.id || '',
            student.name || '',
            student.parentName || '',
            student.parentPhone || student.phone || '',
            assistants.join(' '),
          ].join(' ').toLowerCase();
          const matchSearch = !searchKey || searchableText.includes(searchKey);
          const matchLevel = !levelFilter || student.level === levelFilter;
          const matchTeacher = !teacherFilter
            || (teacherFilter === '__UNASSIGNED__' ? assistants.length === 0 : assistants.includes(teacherFilter));
          return matchSearch && matchLevel && matchTeacher;
        });
      const summary = document.getElementById('director-assignment-summary');
      if (summary) {
        summary.innerHTML = `
          <span class="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">Tổng ${studentsData.length} học viên</span>
          <span class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">${assignedCount} đã phân công</span>
          <span class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">${unassignedCount} chưa phân công</span>
          <span class="sm:ml-auto">Đang hiển thị ${filteredStudents.length} học viên</span>`;
      }

      if (!filteredStudents.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="p-6 text-center text-xs text-slate-500">
              Không tìm thấy học viên phù hợp với bộ lọc hiện tại.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filteredStudents.map(({ student, idx }) => {
        const warn = getWarningConfig(student.completedSessions, student.level);
        return `
          <tr class="hover:bg-slate-50 border-b">
            <td class="p-3 text-center font-mono font-bold text-[#8B1515] border-r">${student.id}</td>
            <td class="p-3 border-r min-w-[380px]">
              <div class="flex items-center gap-2.5">
                <div class="relative shrink-0">
                  <img src="${getAvatarDisplayUrl(student.avatar)}" onerror="handleAvatarImageError(this)" alt="Avatar ${student.name}" class="w-24 h-24 rounded-full object-cover border-2 border-amber-300 shadow-sm">
                  <button type="button" onclick="openDirectAvatarUpload(${idx})" aria-label="Đổi avatar ${student.name}" title="Đổi avatar" class="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-white border border-slate-200 text-[#8B1515] shadow flex items-center justify-center text-xs hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[#8B1515]">📷</button>
                </div>
                <div class="min-w-0">
                  <h4 class="font-bold text-slate-800 text-xs">${student.name}</h4>
                  <p class="text-[10px] text-slate-400 truncate">PH: ${student.parentName || '---'} · SĐT: ${student.parentPhone || student.phone || '---'}</p>
                </div>
              </div>
            </td>
            <td class="p-2 border-r text-center">${renderLevelSelectHtml(student.level, `updateStudentLevel(${idx}, this.value)`)}</td>
            <td class="p-3 border-r text-center font-mono font-bold ${warn.bg} ${warn.text}">${student.completedSessions || 0} / 40</td>
            <td class="p-2 border-r">${generateAssistantCheckboxes(student, idx)}</td>
            <td class="p-3 border-r text-center font-mono text-xs text-slate-500">${student.regDate || '---'}</td>
            <td class="p-3 text-center">
              <div class="flex justify-center gap-1.5">
                <button onclick="openEditStudentModal(${idx})" class="p-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold shadow">✏️ Sửa</button>
                <button onclick="openPaymentPopup('${student.id}')" class="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow">💰 Thanh toán</button>
                <button onclick="deleteStudent(${idx})" class="p-1.5 bg-red-600 text-white rounded-lg text-xs font-bold shadow">🚪 Dừng</button>
              </div>
            </td>
          </tr>`;
      }).join('');
    }

    function generateAssistantCheckboxes(student, index) {
      if (!assistantTeachers.length) return `<span class="text-xs text-slate-400 italic">Chưa có Trợ Giảng</span>`;
      return `<div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">` +
        assistantTeachers.map(t => {
          const isChecked = student.assistants?.includes(t) ? 'checked' : '';
          const checkedStyle = isChecked ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-600';
          return `<label class="inline-flex items-center gap-1.5 border ${checkedStyle} px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer hover:border-red-300"><input type="checkbox" ${isChecked} onchange="toggleAssistant(${index}, '${t}', this.checked)" class="w-3.5 h-3.5 accent-[#8B1515]"> ${t}</label>`;
        }).join('') + `</div>`;
    }

    async function toggleAssistant(studentIdx, teacherName, isChecked) {
      const student = studentsData[studentIdx];
      if (!student) return;
      const previousAssistants = normalizeAssistants(student.assistants);
      const nextAssistants = [...previousAssistants];

      if (isChecked) {
        if (!nextAssistants.includes(teacherName)) nextAssistants.push(teacherName);
      } else {
        const teacherIndex = nextAssistants.indexOf(teacherName);
        if (teacherIndex !== -1) nextAssistants.splice(teacherIndex, 1);
      }
      student.assistants = nextAssistants;
      updateAllViews();

      try {
        const result = await apiCall('update_assistants', { studentId: student.id, assistants: nextAssistants });
        if (!result || result.status !== 'success') {
          throw new Error(result?.message || 'Google Sheet không xác nhận lưu phân công.');
        }
        await refreshDataAfterMutation();
        showToast(`Đã lưu phân công ${teacherName} cho ${student.name}`);
      } catch (error) {
        student.assistants = previousAssistants;
        updateAllViews();
        console.error('Lỗi lưu phân công trợ giảng:', error);
        showToast(`Không lưu được phân công: ${error.message}`, 'error');
      }
    }

    function renderStudentProfileCards() {
      const container = document.getElementById('profile-cards-container');
      if (!container) return;

      const searchKey = (document.getElementById('profile-search-input')?.value || '').toLowerCase();
      const levelFilter = document.getElementById('profile-filter-level')?.value || '';
      const teacherFilter = document.getElementById('profile-filter-teacher')?.value || '';
      const progressFilter = document.getElementById('profile-filter-progress')?.value || '';

      let filtered = studentsData.filter(s => {
        const matchSearch = !searchKey || s.name.toLowerCase().includes(searchKey) || s.id.toLowerCase().includes(searchKey) || (s.parentName && s.parentName.toLowerCase().includes(searchKey));
        const matchLevel = !levelFilter || s.level === levelFilter;
        const assistants = normalizeAssistants(s.assistants);
        const matchTeacher = !teacherFilter
          || (teacherFilter === '__UNASSIGNED__' ? assistants.length === 0 : assistants.includes(teacherFilter));
        
        let matchProgress = true;
        if (progressFilter === 'over30') matchProgress = isStudentOverdue(s);
        else if (progressFilter === 'over9') matchProgress = (s.completedSessions > 6 && !isStudentOverdue(s));
        else if (progressFilter === 'under9') matchProgress = s.completedSessions <= 6;

        return matchSearch && matchLevel && matchTeacher && matchProgress;
      });

      document.getElementById('profile-student-count').innerText = filtered.length;

      const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
      if (profileCurrentPage > totalPages) profileCurrentPage = totalPages;
      const startIdx = (profileCurrentPage - 1) * PAGE_SIZE;
      const paged = filtered.slice(startIdx, startIdx + PAGE_SIZE);

      if (!paged.length) {
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-2xl border">Không tìm thấy hồ sơ học viên phù hợp.</div>`;
        return;
      }

      container.innerHTML = paged.map(s => {
        const globalIdx = studentsData.findIndex(st => st.id === s.id);
        const warn = getWarningConfig(s.completedSessions, s.level);
        return `
          <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3 relative overflow-hidden flex flex-col justify-between">
            <div class="flex items-start justify-between gap-3 border-b pb-3">
              <div class="flex items-center gap-3">
                <div class="shrink-0 text-center">
                  <img src="${getAvatarDisplayUrl(s.avatar)}" onerror="handleAvatarImageError(this)" alt="Avatar ${s.name}" class="w-12 h-12 rounded-full object-cover border-2 border-amber-300">
                  <button onclick="openDirectAvatarUpload(${globalIdx})" class="mt-1 text-[10px] font-bold text-[#8B1515] hover:underline" title="Tải ảnh avatar mới lên">📷 Đổi avatar</button>
                </div>
                <div>
                  <span class="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">${s.id}</span>
                  <h3 class="font-bold text-slate-800 text-sm mt-0.5">${s.name}</h3>
                  <p class="text-[11px] text-slate-500 font-medium">Lớp: <strong class="text-slate-700">${s.level || 'Chưa xếp'}</strong></p>
                </div>
              </div>
            </div>
            
            <div class="space-y-1.5 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <div class="flex justify-between"><span>Phụ huynh:</span><strong class="text-slate-800">${s.parentName || '---'}</strong></div>
              <div class="flex justify-between"><span>Số điện thoại:</span><strong class="text-slate-800 font-mono">${s.parentPhone || s.phone || '---'}</strong></div>
              <div class="flex justify-between"><span>Trợ giảng:</span><span class="font-semibold text-red-800">${(s.assistants || []).join(', ') || 'Chưa phân'}</span></div>
              <div class="flex justify-between items-center pt-1 border-t"><span>Đã học:</span><span class="font-bold font-mono px-2 py-0.5 rounded ${warn.bg} ${warn.text}">${s.completedSessions || 0} / 40 buổi</span></div>
            </div>

            <div class="flex gap-2 pt-1">
              <button onclick="openStudentReportCard('${s.id}')" class="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-xl text-xs shadow">🎴 Thẻ Báo Cáo</button>
              <button onclick="openEditStudentModal(${globalIdx})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">✏️ Sửa</button>
            </div>
          </div>`;
      }).join('');

      const controls = document.getElementById('profile-pagination-controls');
      if (controls) {
        controls.innerHTML = `
          <span class="text-slate-500">Hiển thị ${startIdx + 1} - ${Math.min(startIdx + PAGE_SIZE, filtered.length)} / ${filtered.length} hồ sơ</span>
          <div class="flex gap-1.5">
            <button onclick="profileCurrentPage--; renderStudentProfileCards();" ${profileCurrentPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold">Trang trước</button>
            <span class="px-3 py-1.5 bg-slate-200 rounded-lg font-mono font-bold">${profileCurrentPage} / ${totalPages}</span>
            <button onclick="profileCurrentPage++; renderStudentProfileCards();" ${profileCurrentPage === totalPages ? 'disabled' : ''} class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg font-bold">Trang sau</button>
          </div>`;
      }
    }

    function renderTeacherCards() {
      const container = document.getElementById('teacher-cards-container');
      if (!container) return;

      const searchKey = (document.getElementById('teacher-search-input')?.value || '').toLowerCase().trim();
      const assignedStudents = studentsData.filter(s => {
        const isMyClass = currentUserRole === 'director' || (s.assistants && s.assistants.includes(currentUserName));
        return isMyClass;
      });
      const myStudents = assignedStudents
        .filter(s => {
          const searchableText = `${s.name || ''} ${s.id || ''}`.toLowerCase();
          return !searchKey || searchableText.includes(searchKey);
        })
        .sort((a, b) => {
          const priorityDifference = getProgressWarningPriority(b.completedSessions || 0, b.level)
            - getProgressWarningPriority(a.completedSessions || 0, a.level);
          return priorityDifference || studentsData.indexOf(a) - studentsData.indexOf(b);
        });

      const countEl = document.getElementById('teacher-student-count');
      if (countEl) countEl.innerText = assignedStudents.length;
      const renewalCount = document.getElementById('teacher-renewal-count');
      if (renewalCount) renewalCount.innerText = assignedStudents.filter(student => getProgressWarningPriority(student.completedSessions || 0, student.level) === 3).length;
      const careCount = document.getElementById('teacher-care-count');
      if (careCount) careCount.innerText = assignedStudents.filter(student => getProgressWarningPriority(student.completedSessions || 0, student.level) === 2).length;

      if (!myStudents.length) {
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-2xl border">Không có học viên nào thuộc lớp phụ trách.</div>`;
        return;
      }

      container.innerHTML = myStudents.map(s => {
        const globalIdx = studentsData.findIndex(st => st.id === s.id);
        const warn = getWarningConfig(s.completedSessions, s.level);
        const priority = getProgressWarningPriority(s.completedSessions || 0, s.level);
        const warningLabel = priority === 3
          ? '<span class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Cần gia hạn</span>'
          : priority === 2
            ? '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Cần chăm sóc</span>'
            : priority === 1
              ? '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Theo dõi tốt</span>'
              : '';
        const attendedToday = hasAttendanceDate(s.sessions, getFormattedToday());
        return `
          <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
            <div class="flex items-center justify-between border-b pb-3">
              <div class="flex items-center gap-3">
                <img src="${getAvatarDisplayUrl(s.avatar)}" onerror="handleAvatarImageError(this)" alt="Avatar ${s.name}" class="w-10 h-10 rounded-full object-cover border">
                <div>
                  <h3 class="font-bold text-slate-800 text-sm">${s.name}</h3>
                  <p class="text-[11px] text-slate-400 font-mono">${s.id} - ${s.level}</p>
                </div>
              </div>
              <div class="flex flex-col items-end gap-1">
                <span class="px-2.5 py-1 rounded-full text-xs font-bold font-mono ${warn.bg} ${warn.text}">${s.completedSessions || 0} / 40b</span>
                ${warningLabel}
              </div>
            </div>
            
            <div class="flex flex-col gap-2 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-slate-500">Buổi kế tiếp: <strong class="text-slate-800">Buổi ${(s.completedSessions || 0) + 1}</strong></span>
                <span class="font-bold ${isFeePaid(s) ? 'text-emerald-600' : 'text-red-600'}">${isFeePaid(s) ? 'Đã đóng học phí' : 'Chưa đóng học phí'}</span>
              </div>
              <div class="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs">
                <span class="text-slate-500">Điểm danh hôm nay</span>
                <strong class="${attendedToday ? 'text-emerald-700' : 'text-slate-500'}">${attendedToday ? '✓ Đã điểm danh' : 'Chưa điểm danh'}</strong>
              </div>
              <div class="flex gap-2">
                <button onclick="openTeacherStudentDetails('${s.id}')" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs shadow">📋 Chi tiết</button>
                <button onclick="openPaymentPopup('${s.id}')" class="px-3 py-1.5 ${isFeePaid(s) ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-amber-500 hover:bg-amber-600 text-slate-900'} font-bold rounded-xl text-xs shadow">💰 ${isFeePaid(s) ? 'Gia hạn' : 'Đóng học phí'}</button>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    function openTeacherStudentDetails(studentId) {
      const student = studentsData.find(s => s.id === studentId);
      if (!student) return;

      const sessions = Array.isArray(student.sessions) ? student.sessions.slice(0, 40) : [];
      while (sessions.length < 40) sessions.push('');
      const completedCount = sessions.filter(hasRecordedAttendance).length;

      document.getElementById('teacher-detail-student-name').textContent = student.name || 'Học viên';
      document.getElementById('teacher-detail-student-level').textContent = `Mã: ${student.id || '---'} · Lớp: ${student.level || 'Chưa xếp lớp'}`;
      document.getElementById('teacher-detail-registration-date').textContent = formatDisplayDate(student.regDate) || 'Chưa cập nhật';
      document.getElementById('teacher-detail-session-count').textContent = `${completedCount} / 40 buổi`;

      const sessionContainer = document.getElementById('teacher-detail-sessions');
      sessionContainer.replaceChildren();
      sessions.forEach((value, index) => {
        const entry = parseSessionEntry(value);
        const attendedDate = getSessionDisplayDate(value);
        const sessionCard = document.createElement('button');
        sessionCard.type = 'button';
        sessionCard.onclick = () => openSessionEditor(studentsData.findIndex(item => item.id === student.id), index);
        sessionCard.className = `text-left ${hasRecordedAttendance(value)
          ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-2'
          : 'rounded-lg border border-slate-200 bg-white p-2'} hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500`;

        const sessionNumber = document.createElement('p');
        sessionNumber.className = 'text-[10px] font-bold text-slate-500';
        sessionNumber.textContent = `Buổi ${index + 1}`;

        const sessionDate = document.createElement('p');
        sessionDate.className = `mt-1 text-xs font-semibold ${hasRecordedAttendance(value) ? 'text-emerald-800' : 'text-slate-400'}`;
        sessionDate.textContent = attendedDate ? (normalizeAttendanceDate(attendedDate) || attendedDate) : 'Chưa học';

        sessionCard.append(sessionNumber, sessionDate);
        if (entry.note) {
          const note = document.createElement('p');
          note.className = 'mt-1 truncate text-[10px] text-amber-800';
          note.textContent = `📝 ${entry.note}`;
          note.title = entry.note;
          sessionCard.appendChild(note);
        }
        sessionContainer.appendChild(sessionCard);
      });

      document.getElementById('modal-teacher-student-details').classList.remove('hidden');
    }

    function setDirectorAttendanceToday() {
      const dateInput = document.getElementById('director-attendance-date');
      if (dateInput) dateInput.value = getLocalDateInputValue();
      renderDirectorAttendance();
    }

    function renderDirectorAttendance() {
      const container = document.getElementById('director-attendance-cards');
      const dateInput = document.getElementById('director-attendance-date');
      if (!container || !dateInput) return;

      if (!dateInput.value) dateInput.value = getLocalDateInputValue();
      const selectedDate = formatAttendanceDate(dateInput.value);
      const dateLabel = document.getElementById('director-attendance-selected-date');
      const countLabel = document.getElementById('director-attendance-count');
      if (!selectedDate) {
        if (dateLabel) dateLabel.textContent = 'Vui lòng chọn ngày hợp lệ.';
        if (countLabel) countLabel.textContent = '';
        container.innerHTML = '';
        return;
      }

      const searchKey = (document.getElementById('director-attendance-search')?.value || '').trim().toLocaleLowerCase('vi');
      const filteredStudents = studentsData
        .map((student, index) => ({ student, index }))
        .filter(({ student }) => {
          const searchableText = `${student.name || ''} ${student.id || ''}`.toLocaleLowerCase('vi');
          return !searchKey || searchableText.includes(searchKey);
        });
      const attendedCount = filteredStudents.filter(({ student }) => hasAttendanceDate(student.sessions, selectedDate)).length;
      if (dateLabel) dateLabel.textContent = `Ngày điểm danh: ${selectedDate}`;
      if (countLabel) countLabel.textContent = `${attendedCount} / ${filteredStudents.length} học viên đã điểm danh`;

      if (!filteredStudents.length) {
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">${studentsData.length ? 'Không tìm thấy học viên phù hợp.' : 'Chưa có dữ liệu học viên. Hãy đồng bộ Google Sheet để tải danh sách mới nhất.'}</div>`;
        return;
      }

      container.innerHTML = filteredStudents.map(({ student, index }) => {
        const sessions = Array.isArray(student.sessions) ? student.sessions : [];
        const isAttended = hasAttendanceDate(sessions, selectedDate);
        const nextSessionIndex = sessions.findIndex(value => !hasRecordedAttendance(value));
        const isSaving = attendanceSavingStudentIds.has(String(student.id));
        const isFull = nextSessionIndex === -1;
        const statusClass = isAttended
          ? 'bg-emerald-50 border-emerald-200'
          : isFull ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200';
        const statusText = isAttended
          ? 'Đã ghi nhận ngày này'
          : isFull ? 'Đã đủ 40 buổi' : `Buổi tiếp theo: ${nextSessionIndex + 1}`;
        const buttonText = isSaving ? 'Đang lưu điểm danh...' : isAttended ? '✓ Đã điểm danh' : '✓ Ghi nhận điểm danh';
        return `
          <article class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${getAvatarDisplayUrl(student.avatar)}" onerror="handleAvatarImageError(this)" alt="Avatar ${student.name || 'học viên'}" class="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0">
              <div class="min-w-0 flex-1">
                <h3 class="font-bold text-slate-800 truncate">${student.name || 'Chưa có tên'}</h3>
                <p class="text-xs text-slate-500">${student.id || 'Chưa có mã'} · ${student.level || 'Chưa xếp lớp'}</p>
              </div>
              <span class="shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${isAttended ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">${student.completedSessions || 0}/40 buổi</span>
            </div>
            <div class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${statusClass}">
              <span>${statusText}</span>
              ${student.assistants?.length ? `<span class="text-slate-500 text-right">${student.assistants.join(', ')}</span>` : ''}
            </div>
            <button type="button" onclick="markDirectorAttendance(${index})" ${isAttended || isSaving || isFull ? 'disabled' : ''} class="w-full px-3 py-2.5 rounded-xl text-sm font-bold shadow-sm ${isAttended || isFull || isSaving ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-800 text-white'}">
              ${isFull && !isAttended && !isSaving ? 'Đã đủ số buổi' : buttonText}
            </button>
          </article>`;
      }).join('');
    }

    async function markDirectorAttendance(studentIndex) {
      if (currentUserRole !== 'director') {
        showToast('Chức năng này chỉ dành cho giám đốc.', 'error');
        return;
      }
      const student = studentsData[studentIndex];
      const dateInput = document.getElementById('director-attendance-date');
      const selectedDate = formatAttendanceDate(dateInput?.value);
      if (!student || !selectedDate) {
        showToast('Vui lòng chọn học viên và ngày điểm danh hợp lệ.', 'error');
        return;
      }
      const studentId = String(student.id);
      if (attendanceSavingStudentIds.has(studentId)) return;
      if (hasAttendanceDate(student.sessions, selectedDate)) {
        showToast(`${student.name} đã được điểm danh ngày ${selectedDate}.`, 'error');
        renderDirectorAttendance();
        return;
      }

      const sessionIndex = (Array.isArray(student.sessions) ? student.sessions : [])
        .findIndex(value => !hasRecordedAttendance(value));
      if (sessionIndex < 0) {
        showToast(`${student.name} đã đủ 40 buổi học.`, 'error');
        return;
      }

      attendanceSavingStudentIds.add(studentId);
      renderDirectorAttendance();
      try {
        const attendanceValue = selectedDate === formatAttendanceDate(getLocalDateInputValue())
          ? getFormattedToday()
          : selectedDate;
        await updateMasterSession(studentIndex, sessionIndex, attendanceValue);
      } finally {
        attendanceSavingStudentIds.delete(studentId);
        renderDirectorAttendance();
      }
    }

    function renderDailySummaryCards() {
      const container = document.getElementById('summary-cards-container');
      const dateDisplay = document.getElementById('summary-date-display');
      if (!container) return;

      const today = getFormattedToday();
      if (dateDisplay) dateDisplay.innerText = today;

      const searchKey = (document.getElementById('summary-search-input')?.value || '').toLowerCase().trim();
      const attended = studentsData.filter(s => {
        const hasToday = hasAttendanceDate(s.sessions, today);
        const matchSearch = !searchKey || s.name.toLowerCase().includes(searchKey) || s.id.toLowerCase().includes(searchKey);
        return hasToday && matchSearch;
      });

      document.getElementById('summary-student-count').innerText = attended.length;

      if (!attended.length) {
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-2xl border">Chưa có học viên nào được điểm danh trong ngày hôm nay (${today}).</div>`;
        return;
      }

      container.innerHTML = attended.map(s => `
        <div class="bg-white p-4 rounded-2xl shadow-sm border border-emerald-200 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="${getAvatarDisplayUrl(s.avatar)}" onerror="handleAvatarImageError(this)" alt="Avatar ${s.name}" class="w-10 h-10 rounded-full object-cover border">
            <div>
              <h4 class="font-bold text-slate-800 text-sm">${s.name}</h4>
              <p class="text-[11px] text-slate-400">${s.id} - ${s.level}</p>
            </div>
          </div>
          <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-xl text-xs font-mono">Đã có mặt</span>
        </div>`).join('');
    }

    function openStudentReportCard(studentId) {
      const student = studentsData.find(s => s.id === studentId);
      if (!student) return;
      currentReportStudent = student;

      document.getElementById('card-student-id').innerText = student.id;
      document.getElementById('card-student-name').innerText = student.name;
      document.getElementById('card-student-level').innerText = student.level || 'Chưa xếp lớp';
      document.getElementById('card-student-parent').innerText = student.parentName || '---';
      setAvatarImage(document.getElementById('card-student-avatar'), student.avatar);
      document.getElementById('card-student-sessions').innerText = `${student.completedSessions || 0} / 40 buổi`;

      const pct = Math.min(100, Math.round(((student.completedSessions || 0) / 40) * 100));
      document.getElementById('card-progress-bar').style.width = `${pct}%`;

      const lastSess = (student.sessions || []).filter(hasRecordedAttendance).pop();
      document.getElementById('card-student-lastdate').innerText = lastSess ? getSessionDisplayDate(lastSess) : 'Chưa có vết';

      document.getElementById('modal-student-card').classList.remove('hidden');
    }

    async function downloadReportCard(format) {
      const el = document.getElementById('report-card-element');
      if (!el) return;

      try {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true });
        if (format === 'image') {
          const link = document.createElement('a');
          link.download = `BaoCao_${currentReportStudent?.name || 'HocVien'}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } else if (format === 'pdf') {
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF('p', 'mm', 'a5');
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 10, 10, 128, 0);
          pdf.save(`BaoCao_${currentReportStudent?.name || 'HocVien'}.pdf`);
        }
      } catch (err) { alert("Lỗi khi xuất thẻ báo cáo!"); }
    }

    function renderTeacherManagementPage() {
      const container = document.getElementById('list-assistant-teachers');
      if (!container) return;
      container.innerHTML = assistantTeachers.length 
        ? assistantTeachers.map(t => `
          <div class="flex justify-between items-center p-3 bg-slate-50 border rounded-xl">
            <div>
              <span class="text-xs font-bold text-slate-800">👤 ${t}</span>
              <span class="text-[10px] text-slate-400 font-mono ml-2">(MK: ${accountPasswords[t] || '123456'})</span>
            </div>
            <button onclick="removeTeacher('${t}')" class="text-xs font-bold text-red-600 hover:underline">Xóa</button>
          </div>`).join('')
        : `<p class="text-xs text-slate-400">Chưa có trợ giảng nào.</p>`;
    }

    function renderLevelManagementPage() {
      const container = document.getElementById('list-custom-levels');
      if (!container) return;
      const allLevels = getAllLevels();
      container.innerHTML = allLevels.length 
        ? allLevels.map(lvl => `
          <div class="flex justify-between items-center p-3 bg-slate-50 border rounded-xl">
            <span class="text-xs font-bold text-slate-700">📚 ${lvl}</span>
            <button onclick="removeCustomLevel('${lvl}')" class="text-xs font-bold text-red-600 hover:underline">Xóa</button>
          </div>`).join('')
        : `<p class="text-xs text-slate-400">Chưa có cấp độ nào.</p>`;
    }

    async function handleAddNewLevelSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('new_level_name_input');
      const val = input.value.trim();
      if (!val) return;
      if (getAllLevels().includes(val)) return alert("⚠️ Loại lớp này đã tồn tại!");

      try {
        await apiCall('addLevel', { level: val });
        customLevelsList.push(val);
        saveAllDataToLocalStorage();
        input.value = '';
        updateAllViews();
        await refreshDataAfterMutation();
        showToast(`Đã thêm loại lớp "${val}"`);
      } catch (err) {
        showToast(`✕ Không thể lưu cấp độ lên Sheet: ${err.message}`, 'error');
      }
    }

    async function removeCustomLevel(lvlName) {
      const confirmOk = await showConfirmModal(`Xóa loại lớp "${lvlName}" khỏi danh sách?`);
      if (!confirmOk) return;

      try {
        await apiCall('deleteLevel', { level: lvlName });
        defaultLevelOptions = defaultLevelOptions.filter(l => l !== lvlName);
        customLevelsList = customLevelsList.filter(l => l !== lvlName);
        saveAllDataToLocalStorage();
        updateAllViews();
        await refreshDataAfterMutation();
        showToast(`Đã xóa loại lớp "${lvlName}"`);
      } catch (err) {
        showToast(`✕ Không thể xóa cấp độ trên Sheet: ${err.message}`, 'error');
      }
    }

    function openAddTeacherModal() {
      document.getElementById('teacher_name_input').value = '';
      document.getElementById('teacher_pwd_input').value = '123456';
      document.getElementById('modal-add-teacher').classList.remove('hidden');
    }

    async function handleAddTeacherSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('teacher_name_input').value.trim();
      const pwd = document.getElementById('teacher_pwd_input').value.trim() || '123456';
      if (!name) return;
      if (assistantTeachers.includes(name)) return alert("⚠️ Trợ giảng này đã tồn tại!");

      assistantTeachers.push(name);
      accountPasswords[name] = pwd;
      saveAllDataToLocalStorage();
      closeModal('modal-add-teacher');
      updateAllViews();
      showToast(`Đã thêm trợ giảng ${name}`);

      try {
        await apiCall('addTeacher', { teacherName: name, password: pwd });
        await refreshDataAfterMutation();
      } catch (err) {
        showToast(`Không thể lưu trợ giảng: ${err.message}`, 'error');
      }
    }

    async function removeTeacher(teacherName) {
      const confirmOk = await showConfirmModal(`Xóa trợ giảng "${teacherName}"?`);
      if (!confirmOk) return;
      assistantTeachers = assistantTeachers.filter(t => t !== teacherName);
      delete accountPasswords[teacherName];
      studentsData.forEach(s => { if (Array.isArray(s.assistants)) s.assistants = s.assistants.filter(t => t !== teacherName); });
      saveAllDataToLocalStorage();
      updateAllViews();
      try {
        await apiCall('deleteTeacher', { teacherName });
        await refreshDataAfterMutation();
      } catch (err) {
        showToast(`Không thể xóa trợ giảng: ${err.message}`, 'error');
      }
    }

    // Đổi mật khẩu tài khoản
    async function handleChangePasswordSubmit(e) {
      e.preventDefault();
      const oldPwd = document.getElementById('pwd_old').value;
      const newPwd = document.getElementById('pwd_new').value;
      const confirmPwd = document.getElementById('pwd_confirm').value;

      if (newPwd !== confirmPwd) {
        return alert("⚠️ Mật khẩu mới và xác nhận mật khẩu không khớp!");
      }

      const accountName = currentUserRole === 'director' ? 'director' : currentUserName;
      const currentPwd = accountPasswords[accountName] || '123456';
      if (oldPwd !== currentPwd) {
        return alert("⚠️ Mật khẩu hiện tại không đúng!");
      }

      try {
        await apiCall('changePassword', { username: accountName, oldPassword: oldPwd, newPassword: newPwd });
        accountPasswords[accountName] = newPwd;
        saveAllDataToLocalStorage();
        await refreshDataAfterMutation();
        showToast("Đã đổi mật khẩu và cập nhật lên Sheet thành công!");

        document.getElementById('pwd_old').value = '';
        document.getElementById('pwd_new').value = '';
        document.getElementById('pwd_confirm').value = '';
      } catch (err) {
        showToast(`✕ Không thể cập nhật mật khẩu lên Sheet: ${err.message}`, 'error');
      }
    }

    // Xác thực & Khởi tạo
    function initLoginTeacherList() {
      const select = document.getElementById('login-teacher-select');
      if (select) {
        select.innerHTML = assistantTeachers.length 
          ? assistantTeachers.map(t => `<option value="${t}">${t}</option>`).join('') 
          : `<option value="">-- Chưa có trợ giảng --</option>`;
      }
    }

    function handleLoginSubmit(role) {
      document.getElementById('login-error-msg').classList.add('hidden');
      const isDirector = role === 'director';
      const username = isDirector ? 'director' : document.getElementById('login-teacher-select').value;
      const pwdInput = isDirector ? document.getElementById('login-pwd-director') : document.getElementById('login-pwd-teacher');
      const validPwd = accountPasswords[username] || '123456';

      if (pwdInput.value === validPwd) {
        loginAs(role, isDirector ? 'Giám Đốc' : username);
        pwdInput.value = '';
      } else {
        document.getElementById('login-error-msg').classList.remove('hidden');
      }
    }

    function loginAs(role, name, fromSession = false) {
      currentUserRole = role;
      currentUserName = name;
      sessionStorage.setItem('TV_GLOBAL_ROLE', role);
      sessionStorage.setItem('TV_GLOBAL_USER', name);
      showUpcomingBirthdays();

      document.getElementById('screen-login').classList.add('hidden');
      document.getElementById('app-container').classList.remove('hidden');
      const userInfo = document.getElementById('user-info-text');
      if (userInfo) userInfo.innerText = name;
      const passwordUsername = document.getElementById('pwd-change-username-display');
      if (passwordUsername) passwordUsername.innerText = name;

      const badge = document.getElementById('user-role-badge');
      if (role === 'director') {
        badge.innerText = 'Admin';
        badge.className = "text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-200 text-[#8B1515] sm:inline-block hidden";
        document.getElementById('admin-nav-buttons').classList.remove('hidden');
        showPage(fromSession ? document.body.dataset.appPage : 'page-admin-master');
      } else {
        badge.innerText = 'Trợ Giảng';
        badge.className = "text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-500 text-white sm:inline-block hidden";
        document.getElementById('admin-nav-buttons').classList.add('hidden');
        const teacherClassName = document.getElementById('teacher-class-name');
        if (teacherClassName) teacherClassName.innerText = name;
        showPage(fromSession ? document.body.dataset.appPage : 'page-teacher-attendance');
      }
    }

    function logout() {
      sessionStorage.clear();
      location.reload();
    }

    function restoreSession() {
      const role = sessionStorage.getItem('TV_GLOBAL_ROLE');
      const name = sessionStorage.getItem('TV_GLOBAL_USER');
      if (role && name) {
        loginAs(role, name, true);
      }
    }

    // Khởi chạy khi nạp xong trang
    window.onload = async function() {
      setupAllDateInputs();
      loadDataFromLocalStorage();
      initLoginTeacherList();
      updateAllViews();
      restoreSession();
      await fetchDataFromGoogleSheet();
    };
