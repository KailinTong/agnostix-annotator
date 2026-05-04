import fs from 'fs';
let content = fs.readFileSync('./index.tsx', 'utf8');
content = content.replace(/incident/g, 'situation');
content = content.replace(/Incident/g, 'Situation');
fs.writeFileSync('./index.tsx', content);
