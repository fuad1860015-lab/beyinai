const fs = require('fs');
const code = fs.readFileSync('C:/Users/SM/.gemini/antigravity/scratch/sexsi-ai-asistant/public/app.js', 'utf8');
const ids = Array.from(code.matchAll(/getElementById\(["']([^"']+)["']\)/g)).map(m => m[1]);
console.log(Array.from(new Set(ids)).sort());
