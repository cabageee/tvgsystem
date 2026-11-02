const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');

const backend = fs.readFileSync('tracker-backend.gs.txt', 'utf8');
assert.notEqual(backend.indexOf('// TRACKER GANTT'), -1, 'Workspace Tracker backend section is missing.');

let actorName = 'An';
let task;
let lockDepth = 0;
let maximumLockDepth = 0;
let lockCount = 0;
let lastHtml = '';
const scriptCache = new Map();
const writes = [];
const taskSheet = {
  getRange(row, column, _numRows, numColumns) {
    return {
      setValue(value) {
        writes.push({ row, column, value });
        if (column === 23) task.completionSubmissions = JSON.parse(value);
        if (column === 9) task.status = value;
      },
      setValues(values) {
        writes.push({ row, column, values });
      },
      clearContent() {
        writes.push({ row, column, numColumns, clear: true });
      }
    };
  }
};

const context = {
  console,
  Logger: { log() {} },
  Utilities: {
    getUuid: () => '01234567-89ab-cdef-0123-456789abcdef',
    computeHmacSha256Signature(value, key) {
      assert.strictEqual(typeof value, 'string', 'HMAC iterations must pass the digest as a supported string input.');
      return Array.from(crypto.createHmac('sha256', key).update(value).digest());
    },
    base64Encode(value) {
      return Buffer.from(value).toString('base64');
    },
    formatDate(date, _timezone, format) {
      if (format === 'yyyy-MM-dd') return date.toISOString().slice(0, 10);
      return '12:00';
    }
  },
  LockService: {
    getScriptLock() {
      return {
        waitLock() {
          assert.strictEqual(lockDepth, 0, 'ScriptLock was acquired recursively.');
          lockDepth++;
          lockCount++;
          maximumLockDepth = Math.max(maximumLockDepth, lockDepth);
        },
        releaseLock() {
          lockDepth--;
        }
      };
    }
  },
  CacheService: {
    getScriptCache() {
      return {
        get: key => scriptCache.get(key) || null,
        put: (key, value) => scriptCache.set(key, value),
        remove: key => scriptCache.delete(key)
      };
    }
  },
  HtmlService: {
    createHtmlOutput(html) {
      lastHtml = html;
      return { setXFrameOptionsMode() { return this; } };
    },
    XFrameOptionsMode: { ALLOWALL: 'allowall' }
  },
  ContentService: {
    MimeType: { JSON: 'json', JAVASCRIPT: 'javascript' },
    createTextOutput(text) {
      return {
        text,
        setMimeType(mimeType) {
          this.mimeType = mimeType;
          return this;
        }
      };
    }
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSpreadsheetTimeZone: () => 'GMT' }) },
  getSpreadsheet: () => ({ getSpreadsheetTimeZone: () => 'GMT' })
};
vm.createContext(context);
vm.runInContext(backend, context, { filename: 'tracker-backend.gs.txt' });

context.issueTrackerSession_ = () => 'test-token';
let directorStoredPassword = 'new-secret';
const configSheet = {
  getDataRange() {
    return {
      getValues() {
        return [
          ['Cấp Độ', 'Mật Khẩu Quản Lý'],
          ['directorPassword', directorStoredPassword]
        ];
      }
    };
  },
  getRange(row, column) {
    return {
      setValue(value) {
        assert.strictEqual(row, 2);
        assert.strictEqual(column, 2);
        directorStoredPassword = value;
      }
    };
  },
  appendRow(row) {
    directorStoredPassword = row[1];
  }
};
context.requireSheet_ = () => configSheet;
context.readConfig = () => ({ directorPassword: directorStoredPassword || '123456' });
assert.strictEqual(
  context.verifyLogin_('director', '123456').status,
  'error',
  'The default director password must not bypass a configured password.'
);
assert.strictEqual(
  context.verifyLogin_('director', 'new-secret').status,
  'success',
  'The configured director password must continue to work.'
);
assert.match(directorStoredPassword, /^TVG-HMAC-SHA256\$10000\$/);
assert.strictEqual(
  context.verifyLogin_('director', 'new-secret').status,
  'success',
  'Migrated password hashes must continue to authenticate.'
);
directorStoredPassword = '';
assert.strictEqual(
  context.verifyLogin_('director', '123456').status,
  'success',
  'The first-run default must remain available when no director password is configured.'
);
assert.strictEqual(
  context.verifyLogin_('director', '123456').mustChangePassword,
  false,
  'First-run director credentials must not force a password-change redirect.'
);
let teacherPassword = '';
const teacherSheet = {
  getRange(row, column) {
    assert.strictEqual(row, 2);
    assert.strictEqual(column, 2);
    return {
      getDisplayValue: () => teacherPassword,
      setValue: value => { teacherPassword = value; }
    };
  }
};
context.requireSheet_ = name => {
  assert.strictEqual(name, 'TroGiang');
  return teacherSheet;
};
context.findRowByTeacherName = (_sheet, name) => name === 'An' ? 2 : null;
const teacherIdentity = context.verifyLogin_('An', '123456');
assert.strictEqual(teacherIdentity.status, 'success');
assert.strictEqual(
  teacherIdentity.mustChangePassword,
  false,
  'Teacher accounts using the default password must not require a password-change redirect.'
);
assert.match(teacherPassword, /^TVG-HMAC-SHA256\$10000\$/);
const passwordHash = context.hashPassword_('a-secure-test-password');
assert(context.verifyPassword_('a-secure-test-password', passwordHash));
assert(!context.verifyPassword_('wrong-password', passwordHash));

context.trackerActor_ = token => {
  if (token === 'forced-change') {
    return { name: 'An', role: 'teacher', mustChangePassword: true };
  }
  if (token !== 'valid-token') throw new Error('Phiên đăng nhập Tracker đã hết hạn.');
  return { name: 'An', role: 'teacher' };
};
assert.throws(
  () => context.handleApiAction({ action: 'updateStudentInfo', student: { id: 'HV001' } }),
  /hết hạn/,
  'Legacy write APIs must reject requests without an authenticated session.'
);
const originalDispatchApiAction = context.dispatchApiAction_;
context.dispatchApiAction_ = () => ({ status: 'success' });
assert.strictEqual(
  context.handleApiAction({ action: 'getData', token: 'forced-change' }).status,
  'success',
  'Existing teacher sessions must not be blocked by a stale password-change requirement.'
);
context.dispatchApiAction_ = originalDispatchApiAction;
assert.throws(
  () => context.authorizeLegacyApiAction_(
    { name: 'An', role: 'teacher' },
    'updateStudentInfo',
    { student: { id: 'HV001', name: 'Changed' } }
  ),
  /Chỉ Giám đốc/,
  'Teachers must not edit student profile data.'
);

function makeSheet(rows) {
  return {
    rows,
    failNextDelete: false,
    getDataRange() {
      return { getValues: () => this.rows.map(row => row.slice()) };
    },
    getLastRow() {
      return this.rows.length;
    },
    getRange(row, column, numRows, numColumns) {
      return {
        getValue: () => this.rows[row - 1][column - 1],
        getValues: () => this.rows.slice(row - 1, row - 1 + (numRows || 1))
          .map(values => values.slice(column - 1, column - 1 + (numColumns || 1)))
      };
    },
    appendRow(row) {
      this.rows.push(row.slice());
    },
    deleteRow(row) {
      if (this.failNextDelete) {
        this.failNextDelete = false;
        throw new Error('simulated delete failure');
      }
      this.rows.splice(row - 1, 1);
    }
  };
}
const activeStudent = ['HV001', 'A', '2000-01-01', 'F', 'L1', '2026-01-01', 'P', '0900', 'Address', 'Đã đóng', 'Note', 'Avatar', 'An'];
const moveSheets = {
  ThongTinHocSinh: makeSheet([['ID'], activeStudent]),
  DiemDanh: makeSheet([['ID'], ['HV001', 'A', '2026-01-01', ...Array(40).fill('')]]),
  HocVienNghiHoc: makeSheet([['ID']])
};
context.requireSheet_ = name => moveSheets[name];
moveSheets.DiemDanh.failNextDelete = true;
assert.throws(
  () => context.moveToInactive('HV001', 'reason'),
  /simulated delete failure/,
  'A failed cross-sheet move must report the original error.'
);
assert.strictEqual(moveSheets.ThongTinHocSinh.rows.filter(row => row[0] === 'HV001').length, 1);
assert.strictEqual(moveSheets.DiemDanh.rows.filter(row => row[0] === 'HV001').length, 1);
assert.strictEqual(moveSheets.HocVienNghiHoc.rows.length, 1);

const restoreSheets = {
  ThongTinHocSinh: makeSheet([['ID']]),
  DiemDanh: makeSheet([['ID']]),
  HocVienNghiHoc: makeSheet([['ID'], ['HV002']])
};
context.requireSheet_ = name => restoreSheets[name];
restoreSheets.HocVienNghiHoc.failNextDelete = true;
assert.throws(
  () => context.restoreStudent({ id: 'HV002', name: 'B', assistants: [] }),
  /simulated delete failure/,
  'A failed restore must report the original error.'
);
assert.strictEqual(restoreSheets.ThongTinHocSinh.rows.filter(row => row[0] === 'HV002').length, 0);
assert.strictEqual(restoreSheets.DiemDanh.rows.filter(row => row[0] === 'HV002').length, 0);
assert.strictEqual(restoreSheets.HocVienNghiHoc.rows.filter(row => row[0] === 'HV002').length, 1);

context.readStudents = () => [
  { id: 'HV001', assistants: ['An'] },
  { id: 'HV002', assistants: ['Bình'] }
];
context.readInactive = () => [
  { id: 'HV003', assistants: ['An'] },
  { id: 'HV004', assistants: ['Bình'] }
];
context.readTeachers = () => [];
context.readConfig = () => ({ customLevels: [], trackerManager: '' });
context.requireSheet_ = () => ({});
const teacherData = context.getAllData({ name: 'An', role: 'teacher' });
assert.deepStrictEqual(teacherData.data.map(student => student.id), ['HV001']);
assert.deepStrictEqual(teacherData.inactive.map(student => student.id), ['HV003']);

const handleApiAction = context.handleApiAction;
context.handleApiAction = () => ({ status: 'success', text: '</script>' });
const postResponse = context.doPost({
  parameter: {
    apiRequestId: 'tvg_test_1',
    apiPayload: JSON.stringify({ action: 'verifyLogin', username: 'director', password: 'secret' })
  }
});
assert.match(lastHtml, /window\.parent\.postMessage/);
assert.match(lastHtml, /tvg-api-response/);
assert.match(lastHtml, /tvg_test_1/);
assert.match(lastHtml, /\\u003c\/script>/, 'API responses must escape script-breaking content.');
assert.strictEqual(typeof postResponse.setXFrameOptionsMode, 'function');
context.handleApiAction = handleApiAction;
assert.strictEqual(context.jsonpCallback_('valid.callback_1'), 'valid.callback_1');
assert.strictEqual(context.jsonpCallback_('valid);alert(1)//'), '');
assert(!/params\.callback\s*&&\s*params\.data/.test(backend), 'General API JSONP must be disabled.');

const sourceTask = () => ({
  id: 'task-1',
  title: 'Task',
  createdBy: 'Giám Đốc',
  priority: 1,
  assignees: ['Bình'],
  status: 'NEW',
  rowNumber: 2,
  completionSubmissions: {}
});
context.requireSheet_ = () => taskSheet;
context.trackerTaskRecords_ = () => [task];
context.trackerActor_ = () => ({ name: actorName, role: 'manager' });
task = sourceTask();
assert.throws(
  () => context.trackerAcceptTask_('token', task.id),
  /không được giao/,
  'Managers must not accept tasks assigned to someone else.'
);
assert.strictEqual(writes.length, 0, 'Unauthorized acceptance must not write to the sheet.');
actorName = 'Bình';
assert.strictEqual(context.trackerAcceptTask_('token', task.id).status, 'success');
assert(writes.some(write => write.column === 9 && write.value === 'IN_PROGRESS'));

context.trackerActor_ = () => ({ name: 'Giám Đốc', role: 'director' });
context.trackerIsPersonalTask_ = () => false;
context.trackerValidDate_ = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
context.readTeachers = () => [{ name: 'Bình' }, { name: 'Chi' }];
context.trackerEnsureOutputColumn_ = () => {};
task = { ...sourceTask(), status: 'PENDING' };
assert.throws(
  () => context.trackerUpdateTask_('token', task.id, {
    title: 'Task',
    assignees: ['Chi'],
    startDate: '2026-11-02',
    deadline: '2026-11-03',
    deadlineTime: '17:00'
  }),
  /đang chờ duyệt/,
  'Changing assignees while a task is awaiting approval must be rejected.'
);
task = { ...sourceTask(), status: 'IN_PROGRESS', completionSubmissions: { 'Bình': { submitted: true, note: 'old' } } };
writes.length = 0;
context.trackerUpdateTask_('token', task.id, {
  title: 'Task',
  assignees: ['Chi'],
  startDate: '2026-11-02',
  deadline: '2026-11-03',
  deadlineTime: '17:00'
});
assert(
  writes.some(write => write.column === 23 && write.clear),
  'Changing assignees before approval must clear prior completion submissions.'
);

task = {
  ...sourceTask(),
  status: 'IN_PROGRESS',
  repeatWeekly: true,
  repeatWeek: '2026-10-26',
  startDate: '2026-10-26',
  deadline: '2026-10-30',
  deadlineTime: '17:00',
  completionSubmissions: {}
};
context.trackerCurrentWeekStart_ = () => '2026-11-02';
writes.length = 0;
context.trackerApplyWeeklyTaskChanges_(taskSheet, [task]);
assert(
  writes.some(write => write.column === 20 && write.numColumns === 3 && write.clear),
  'Recurring tasks must clear the prior cycle progress, blocker, and report timestamp.'
);

task = {
  ...sourceTask(),
  status: 'IN_PROGRESS',
  priority: 1,
  assignees: ['An', 'Bình'],
  completionSubmissions: {}
};
context.trackerActor_ = () => ({ name: actorName, role: 'teacher' });
context.trackerIsPersonalTask_ = () => false;
context.trackerEnsureOutputColumn_ = () => {};
lockDepth = 0;
maximumLockDepth = 0;
lockCount = 0;
actorName = 'An';
const firstSubmission = context.handleApiAction({
  action: 'trackerRequestCompletion',
  token: 'token',
  taskId: task.id,
  note: 'Output An'
});
assert.strictEqual(firstSubmission.taskStatus, 'IN_PROGRESS');
actorName = 'Bình';
const secondSubmission = context.handleApiAction({
  action: 'trackerRequestCompletion',
  token: 'token',
  taskId: task.id,
  note: 'Output Bình'
});
assert.strictEqual(secondSubmission.taskStatus, 'PENDING');
assert.strictEqual(lockCount, 2, 'Each write request should acquire exactly one ScriptLock.');
assert.strictEqual(maximumLockDepth, 1, 'Completion submission must not acquire ScriptLock recursively.');

const frontend = fs.readFileSync('app.js', 'utf8');
const trackerPage = fs.readFileSync('executive-tracker.html', 'utf8');
const localServer = fs.readFileSync('server.js', 'utf8');
assert(
  frontend.includes("retryButton.style.display = loginTeacherOptionsError ? 'inline-flex' : 'none'"),
  'The retry button must stay hidden after successful loading even when UI icon styles are applied.'
);
assert.match(
  backend,
  /role: 'director',\s+mustChangePassword: false/,
  'Director login must enter the dashboard without a forced password-change redirect.'
);
assert.doesNotMatch(
  backend,
  /actor\.mustChangePassword && actor\.role !== 'director'/,
  'Accounts must not be blocked from application actions by a forced password-change flag.'
);
assert.doesNotMatch(
  frontend,
  /TV_GLOBAL_MUST_CHANGE_PASSWORD/,
  'The frontend must not redirect users with a stale forced password-change flag.'
);
const reviewNoticeHelper = frontend.match(/function collectNewTeacherTaskReviewNotices\(tasks, notifiedKeys\) \{[\s\S]*?\n    \}/);
assert(reviewNoticeHelper, 'Teacher task return notices must be deduplicated by task review update.');
const collectReviewNotices = new Function(
  'tasks',
  'notifiedKeys',
  `${reviewNoticeHelper[0]}\nreturn collectNewTeacherTaskReviewNotices(tasks, notifiedKeys);`
);
const rejectedTask = {
  id: 'task-1',
  title: 'Điền danh sách',
  status: 'IN_PROGRESS',
  updatedAt: '2026-11-02T10:00:00.000Z',
  reviewNote: 'Thiếu thông tin ở dòng 3.'
};
const noticeKey = JSON.stringify([rejectedTask.id, rejectedTask.updatedAt, rejectedTask.reviewNote]);
assert.strictEqual(
  collectReviewNotices([rejectedTask], []).length,
  1,
  'A newly returned task with a reason must notify its assignee.'
);
assert.strictEqual(
  collectReviewNotices([rejectedTask], [noticeKey]).length,
  0,
  'Refreshing the same returned task must not notify the assignee repeatedly.'
);
assert.strictEqual(
  collectReviewNotices([{ ...rejectedTask, status: 'PENDING' }], []).length,
  0,
  'A task awaiting review must not be presented as returned.'
);
assert(frontend.includes("['apiPayload', JSON.stringify(request)]"), 'Main frontend must POST API payloads.');
assert(frontend.includes('request.token || token ||'), 'Main frontend must attach the active session token to API calls.');
assert(!frontend.includes('docs.google.com/spreadsheets/d/${spreadsheetId}/gviz'), 'Frontend must not read teacher passwords from public Sheets CSV.');
assert(frontend.includes("const requestToken = sessionStorage.getItem('TV_GLOBAL_TRACKER_TOKEN');")
  && frontend.includes('if (!currentUserRole || !requestToken) return false;'), 'Student data must not load before login.');
assert(frontend.includes('newStudent: String(newStudent)'), 'Avatar uploads must identify new-student requests for server-side authorization.');
assert(frontend.includes('pwd.length < 4 || pwd.length > 128'), 'New teacher accounts must require passwords between 4 and 128 characters.');
assert(frontend.includes('newPwd.length < 4 || newPwd.length > 128'), 'Password changes must require passwords between 4 and 128 characters.');
assert(trackerPage.includes('Tuần hiện tại:')
  && trackerPage.includes('day >= start && day <= end'),
  'Task timelines must display the current week and only mark task-active days within it.');
assert(trackerPage.includes('@media (min-width: 701px) and (max-width: 1100px)')
  && trackerPage.includes('#management-section tbody tr'),
  'Assignment and approval tables must reflow into readable cards on compact desktop widths.');
scriptCache.set('LOGIN_ATTEMPTS_director', '10');
assert.match(
  context.verifyLogin_('director', 'anything').message,
  /10 phút/,
  'Login attempts must be throttled after the configured failure limit.'
);
scriptCache.delete('LOGIN_ATTEMPTS_director');
assert(localServer.includes("app.listen(PORT, '127.0.0.1'"), 'The local API must not bind to public network interfaces.');
assert(!localServer.includes("app.use('/uploads'"), 'The legacy public upload directory must stay disabled.');
assert(trackerPage.includes("['apiPayload', JSON.stringify({ action, ...payload })]"), 'Tracker frontend must POST API payloads.');
assert(frontend.includes('event.source !== frame.contentWindow'), 'Main frontend must validate the iframe message source.');
assert(trackerPage.includes('event.source !== frame.contentWindow'), 'Tracker frontend must validate the iframe message source.');
assert(!frontend.includes('callJsonp'), 'Main frontend must not fall back to JSONP.');
assert(!trackerPage.includes('callJsonp'), 'Tracker frontend must not call APIs with JSONP.');

console.log('Tracker behavior checks passed: password compatibility, POST transport, authorization, pending edits, weekly reset, and group completion.');
