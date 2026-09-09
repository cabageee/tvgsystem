const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('script count:', scripts.length);
for (let i = 0; i < scripts.length; i++) {
  const script = scripts[i];
  try {
    new Function(script);
    console.log('script', i, 'OK');
  } catch (e) {
    console.log('script', i, 'ERROR:', e.message);
    const lines = script.split('\n');
    const start = Math.max(0, lines.length - 40);
    for (let j = start; j < lines.length; j++) {
      console.log(String(j + 1).padStart(4), lines[j]);
    }
    process.exit(1);
  }
}
