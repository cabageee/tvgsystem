const fs = require('fs');
const vm = require('vm');
const htmlFiles = fs.readdirSync('.').filter(file => file.endsWith('.html'));
let scriptCount = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  scriptCount += scripts.length;

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    try {
      new Function(script);
    } catch (error) {
      console.error(file, 'inline script', i, 'ERROR:', error.message);
      const lines = script.split('\n');
      const start = Math.max(0, lines.length - 40);
      for (let j = start; j < lines.length; j++) {
        console.error(String(j + 1).padStart(4), lines[j]);
      }
      process.exit(1);
    }
  }

  console.log(file, 'inline scripts OK:', scripts.length);
}

console.log(`Checked ${scriptCount} inline scripts across ${htmlFiles.length} pages.`);

const backendFile = 'tracker-backend.gs.txt';
const backendSource = fs.readFileSync(backendFile, 'utf8');

try {
  new vm.Script(backendSource, { filename: backendFile });
} catch (error) {
  console.error(backendFile, 'ERROR:', error.message);
  process.exit(1);
}

const writeActionsMatch = backendSource.match(/const API_WRITE_ACTIONS_ = new Set\(\[([\s\S]*?)\]\);/);
if (!writeActionsMatch) {
  console.error(backendFile, 'ERROR: Could not find the API write-action lock list.');
  process.exit(1);
}

const writeActions = new Set([...writeActionsMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]));
if (!writeActions.has('trackerRequestCompletion')) {
  console.error(backendFile, 'ERROR: trackerRequestCompletion must use the write lock.');
  process.exit(1);
}

const backendActions = new Set([...backendSource.matchAll(/case\s+'([^']+)'\s*:/g)].map(match => match[1]));
const frontendSource = [
  fs.readFileSync('app.js', 'utf8'),
  fs.readFileSync('executive-tracker.html', 'utf8')
].join('\n');
const frontendActions = new Set([...frontendSource.matchAll(/apiCall\(\s*'([^']+)'/g)].map(match => match[1]));
const missingActions = [...frontendActions].filter(action => !backendActions.has(action));
if (missingActions.length) {
  console.error(backendFile, 'ERROR: Missing API dispatch cases:', missingActions.join(', '));
  process.exit(1);
}

console.log(`${backendFile} syntax OK; ${frontendActions.size} frontend API actions are supported.`);
