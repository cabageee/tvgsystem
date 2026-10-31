const fs = require('fs');
const path = require('path');

const outputDirectory = path.join(__dirname, 'apps-script');
const pageDefinitions = [
  { key: 'index', source: 'index.html', output: 'Index.html', sharedApp: true },
  { key: 'profiles', source: 'profiles.html', output: 'Profiles.html', sharedApp: true },
  { key: 'assignments', source: 'assignments.html', output: 'Assignments.html', sharedApp: true },
  { key: 'attendance', source: 'attendance.html', output: 'Attendance.html', sharedApp: true },
  { key: 'daily-summary', source: 'daily-summary.html', output: 'DailySummary.html', sharedApp: true },
  { key: 'inactive-students', source: 'inactive-students.html', output: 'InactiveStudents.html', sharedApp: true },
  { key: 'teachers', source: 'teachers.html', output: 'Teachers.html', sharedApp: true },
  { key: 'levels', source: 'levels.html', output: 'Levels.html', sharedApp: true },
  { key: 'teacher-attendance', source: 'teacher-attendance.html', output: 'TeacherAttendance.html', sharedApp: true },
  { key: 'change-password', source: 'change-password.html', output: 'ChangePassword.html', sharedApp: true },
  { key: 'executive-tracker', source: 'executive-tracker.html', output: 'ExecutiveTracker.html', sharedApp: false }
];

function readSource(fileName) {
  return fs.readFileSync(path.join(__dirname, fileName), 'utf8');
}

function replaceRequired(source, pattern, replacement, description) {
  const updated = source.replace(pattern, replacement);
  if (updated === source) {
    throw new Error(`Could not apply Apps Script conversion: ${description}`);
  }
  return updated;
}

function pageFileMap() {
  return Object.fromEntries(pageDefinitions.map(page => [page.key, path.basename(page.output, '.html')]));
}

function createAppsScriptBackend() {
  let source = readSource('tracker-backend.gs.txt');
  const routeMap = JSON.stringify(pageFileMap(), null, 2)
    .replace(/"([^"]+)":/g, "'$1':")
    .replace(/"([^"]+)"/g, "'$1'");
  const pageRouter = `const APP_SCRIPT_PAGE_FILES_ = Object.freeze(${routeMap});\n\n`;
  source = source.replace('function doGet(e) {', `${pageRouter}function doGet(e) {`);

  source = replaceRequired(
    source,
    /  return HtmlService\s*\n    \.createHtmlOutputFromFile\('Index'\)\s*\n    \.setTitle\('Thiên Vy Global'\);/,
    `  const page = String(params.page || 'index');
  if (!Object.prototype.hasOwnProperty.call(APP_SCRIPT_PAGE_FILES_, page)) {
    throw new Error('Trang Apps Script không được hỗ trợ: ' + page);
  }

  const fileName = APP_SCRIPT_PAGE_FILES_[page];
  const template = HtmlService.createTemplateFromFile(fileName);
  template.appsScriptUrl = ScriptApp.getService().getUrl() || '';
  return template.evaluate().setTitle('Thiên Vy Global');`,
    'Apps Script page routing'
  );

  const doGetEnd = `  return template.evaluate().setTitle('Thiên Vy Global');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}`;
  source = source.replace(
    "  return template.evaluate().setTitle('Thiên Vy Global');\n}",
    doGetEnd
  );
  return source;
}

function createSharedStyles() {
  const tailwind = readSource('tailwind.css');
  const appCss = readSource('app.css').replace(/^@import[^;]+;\s*/gm, '');
  if (/<\/style/i.test(tailwind) || /<\/style/i.test(appCss)) {
    throw new Error('A stylesheet contains a closing style tag and cannot be safely embedded.');
  }

  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
<style>
${tailwind}
${appCss}
</style>`;
}

function createSharedScript() {
  let appJs = readSource('app.js');
  appJs = replaceRequired(
    appJs,
    /const APP_PAGE_ROUTES = \{[\s\S]*?\n    \};/,
    `const APP_PAGE_ROUTES = {
      'page-admin-master': '?page=index',
      'page-student-profiles': '?page=profiles',
      'page-director-list': '?page=assignments',
      'page-director-attendance': '?page=attendance',
      'page-daily-summary': '?page=daily-summary',
      'page-inactive-students': '?page=inactive-students',
      'page-manage-teachers': '?page=teachers',
      'page-manage-levels': '?page=levels',
      'page-teacher-attendance': '?page=teacher-attendance',
      'page-change-password': '?page=change-password'
    };`,
    'Apps Script page route links'
  );
  appJs = replaceRequired(
    appJs,
    "if (window.location.pathname.split('/').pop() !== route) {",
    "if (new URLSearchParams(window.location.search).get('page') !== route.slice('?page='.length)) {",
    'Apps Script page route check'
  );
  appJs = replaceRequired(
    appJs,
    /const GOOGLE_APPS_SCRIPT_URL = '[^']+';/,
    "const GOOGLE_APPS_SCRIPT_URL = window.GOOGLE_APPS_SCRIPT_URL || '';",
    'Apps Script deployment URL'
  );
  appJs = replaceRequired(
    appJs,
    /\r?\n    if \('serviceWorker' in navigator\) \{[\s\S]*?\r?\n    \}\r?\n\r?\n    \/\/ Khởi chạy khi nạp xong trang/,
    '\n    // Khởi chạy khi nạp xong trang',
    'Apps Script service worker exclusion'
  );

  if (/<\/script/i.test(appJs)) {
    throw new Error('The shared JavaScript contains a closing script tag and cannot be safely embedded.');
  }
  return `<script>\n${appJs}\n</script>`;
}

function createBrandLogo() {
  const logo = fs.readFileSync(path.join(__dirname, 'Logo Thien Vy.png')).toString('base64');
  return `<script>
(() => {
  const logoUrl = 'data:image/png;base64,${logo}';
  const applyLogo = () => {
    document.querySelectorAll('img[data-tvg-brand-logo]').forEach(image => {
      image.src = logoUrl;
    });
    const favicon = document.querySelector('link[data-tvg-brand-favicon]');
    if (favicon) favicon.href = logoUrl;
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLogo, { once: true });
  } else {
    applyLogo();
  }
})();
</script>`;
}

function convertPage(page) {
  let html = readSource(page.source);

  html = html.replace(/<link rel="manifest"[^>]*>\s*/i, '');
  html = html.replace(
    /<link rel="icon" type="image\/png" href="Logo Thien Vy\.png">/i,
    '<link rel="icon" type="image/png" data-tvg-brand-favicon>'
  );
  html = html.replace(
    /<img([^>]*?)src="Logo Thien Vy\.png"/gi,
    '<img$1src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-tvg-brand-logo'
  );

  html = html.replace(
    /href="([a-z0-9-]+)\.html(?:\?([^"]*))?"/gi,
    (_match, pageName, query = '') => {
      const pageKey = pageName.toLowerCase() === 'index' ? 'index' : pageName.toLowerCase();
      const suffix = query ? `&${query.replace(/&amp;/g, '&').replace(/&/g, '&amp;')}` : '';
      return `href="?page=${pageKey}${suffix}"`;
    }
  );

  if (page.sharedApp) {
    html = replaceRequired(
      html,
      /<link rel="stylesheet" href="tailwind\.css">\s*<link rel="stylesheet" href="app\.css">/i,
      "<?!= include('SharedStyles'); ?>",
      `${page.source} styles`
    );
    html = replaceRequired(
      html,
      /<script src="app\.js"><\/script>/i,
      "<script>window.GOOGLE_APPS_SCRIPT_URL = <?!= JSON.stringify(appsScriptUrl || '') ?>;</script>\n<?!= include('SharedScript'); ?>",
      `${page.source} application script`
    );
  } else {
    html = html.replace(
      /href="assets\/fontawesome\/css\/all\.min\.css"/i,
      'href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"'
    );
    html = replaceRequired(
      html,
      /const API_URL = '[^']+';/,
      "const API_URL = window.GOOGLE_APPS_SCRIPT_URL || '';",
      `${page.source} Apps Script URL`
    );
    html = html.replace(/'index\.html'/g, "'?page=index'");
  }

  const deploymentUrl = page.sharedApp
    ? ''
    : '<script>window.GOOGLE_APPS_SCRIPT_URL = <?!= JSON.stringify(appsScriptUrl || \'\') ?>;</script>\n';
  html = html.replace(
    '</head>',
    `${deploymentUrl}<?!= include('BrandLogo'); ?>\n</head>`
  );
  return html;
}

function build() {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'Code.gs'), createAppsScriptBackend());
  fs.writeFileSync(path.join(outputDirectory, 'SharedStyles.html'), createSharedStyles());
  fs.writeFileSync(path.join(outputDirectory, 'SharedScript.html'), createSharedScript());
  fs.writeFileSync(path.join(outputDirectory, 'BrandLogo.html'), createBrandLogo());

  for (const page of pageDefinitions) {
    fs.writeFileSync(path.join(outputDirectory, page.output), convertPage(page));
  }

  console.log(`Built ${pageDefinitions.length} Apps Script pages in ${outputDirectory}`);
}

build();
