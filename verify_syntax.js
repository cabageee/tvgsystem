const fs = require('fs');
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
