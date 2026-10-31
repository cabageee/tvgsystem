const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const outputDirectory = path.join(__dirname, 'apps-script');
const backend = fs.readFileSync(path.join(outputDirectory, 'Code.gs'), 'utf8');
new vm.Script(backend, { filename: 'apps-script/Code.gs' });

const pageMapMatch = backend.match(/const APP_SCRIPT_PAGE_FILES_ = Object\.freeze\((\{[\s\S]*?\})\);/);
assert(pageMapMatch, 'Apps Script page route map is missing.');
const pageMap = vm.runInNewContext(`(${pageMapMatch[1]})`);
for (const fileName of Object.values(pageMap)) {
  assert(fs.existsSync(path.join(outputDirectory, `${fileName}.html`)), `Missing Apps Script page: ${fileName}.html`);
}

const sharedScript = fs.readFileSync(path.join(outputDirectory, 'SharedScript.html'), 'utf8');
const sharedScriptMatch = sharedScript.match(/^<script>\s*([\s\S]*?)\s*<\/script>$/);
assert(sharedScriptMatch, 'Shared Apps Script JavaScript wrapper is invalid.');
new Function(sharedScriptMatch[1]);

const teacherPersonalTaskHelper = sharedScript.match(/function isTeacherPersonalTask\(task\) \{[\s\S]*?\n    \}/);
assert(teacherPersonalTaskHelper, 'Teacher dashboard task-type helper is missing.');
const isTeacherPersonalTask = new Function(
  'task',
  'currentUserName',
  `${teacherPersonalTaskHelper[0]}\nreturn isTeacherPersonalTask(task);`
);
assert(isTeacherPersonalTask({ priority: 4, createdBy: 'An', assignees: ['An'] }, 'An'), 'The teacher dashboard must identify a self-assigned personal task.');
assert(!isTeacherPersonalTask({ priority: 4, createdBy: 'Giám Đốc', assignees: ['An', 'Bình', 'Chi'] }, 'An'), 'The teacher dashboard must not label a director-assigned team task as personal.');

const personalTaskHelper = backend.match(/function trackerIsPersonalTask_\(task\) \{[\s\S]*?\n\}/);
assert(personalTaskHelper, 'Apps Script task-type helper is missing.');
const isBackendPersonalTask = new Function(
  'task',
  `${personalTaskHelper[0]}\nreturn trackerIsPersonalTask_(task);`
);
assert(isBackendPersonalTask({ priority: 4, createdBy: 'An', assignees: ['An'] }), 'A self-assigned personal task must remain personal.');
assert(!isBackendPersonalTask({ priority: 4, createdBy: 'Giám Đốc', assignees: ['An', 'Bình', 'Chi'] }), 'A director-assigned team task must not be classified as personal.');
assert(!isBackendPersonalTask({ priority: 4, createdBy: 'Giám Đốc', assignees: ['An'] }), 'A task assigned by the director must not be personal even with one assignee.');
const trackerPage = fs.readFileSync(path.join(outputDirectory, 'ExecutiveTracker.html'), 'utf8');
const frontendPersonalTaskHelper = trackerPage.match(/function isPersonalTask\(task\) \{[\s\S]*?\n      \}/);
assert(frontendPersonalTaskHelper, 'Tracker task-type helper is missing.');
const isFrontendPersonalTask = new Function(
  'task',
  `${frontendPersonalTaskHelper[0]}\nreturn isPersonalTask(task);`
);
assert(isFrontendPersonalTask({ priority: 4, createdBy: 'An', assignees: ['An'] }), 'The tracker UI must identify a self-assigned personal task.');
assert(!isFrontendPersonalTask({ priority: 4, createdBy: 'Giám Đốc', assignees: ['An', 'Bình', 'Chi'] }), 'The tracker UI must identify a director-assigned team task.');

for (const fileName of fs.readdirSync(outputDirectory).filter(file => file.endsWith('.html'))) {
  const filePath = path.join(outputDirectory, fileName);
  const html = fs.readFileSync(filePath, 'utf8');
  const withoutTemplateTags = html.replace(/<\?!=[\s\S]*?\?>/g, '""');
  for (const match of withoutTemplateTags.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    new Function(match[1]);
  }
  assert(!/href="[^"]+\.html(?:\?[^"]*)?"/i.test(html), `${fileName} still links to a local HTML file.`);
  assert(!/src="(?:app\.js|Logo Thien Vy\.png)"/i.test(html), `${fileName} still references a local asset.`);
}

console.log(`Apps Script bundle syntax OK; ${Object.keys(pageMap).length} routes are available.`);
