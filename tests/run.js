// Запуск всех стендов: node tests/run.js
// Каждый стенд — самостоятельный файл без зависимостей, который печатает
// «итого: N ok, M fail» и выходит с ненулевым кодом при провале.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('_test.js'))
  .sort();

let totalOk = 0, totalFail = 0, broken = [];
const failedFiles = [];

for (const f of files) {
  let out = '', code = 0;
  try {
    out = execFileSync(process.execPath, [path.join(dir, f)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
    code = e.status === undefined ? 1 : e.status;
  }

  const m = out.match(/итого:\s*(\d+)\s*ok,\s*(\d+)\s*fail/);
  if (!m) {
    broken.push(f);
    process.stdout.write(`${pad(f)} СТЕНД НЕ ОТРАБОТАЛ\n`);
    const tail = out.trim().split('\n').slice(-6).join('\n   ');
    if (tail) process.stdout.write('   ' + tail + '\n');
    continue;
  }
  const ok = +m[1], fail = +m[2];
  totalOk += ok; totalFail += fail;
  if (fail || code) failedFiles.push(f);
  process.stdout.write(`${pad(f)} ${fail ? 'FAIL' : '  ok'}  ${ok} ok, ${fail} fail\n`);
  if (fail) {
    for (const line of out.split('\n')) if (line.startsWith('FAIL')) process.stdout.write('   ' + line + '\n');
  }
}

function pad(s) { return (s + ' ').padEnd(24, '.'); }

console.log('\n' + '─'.repeat(52));
console.log(`стендов: ${files.length}   проверок: ${totalOk + totalFail}   провалов: ${totalFail}`);
if (broken.length) console.log('не отработали: ' + broken.join(', '));
if (failedFiles.length) console.log('с провалами:   ' + failedFiles.join(', '));

const bad = totalFail > 0 || broken.length > 0;
console.log(bad ? 'РЕЗУЛЬТАТ: ЕСТЬ ПРОБЛЕМЫ — заливать нельзя' : 'РЕЗУЛЬТАТ: всё зелёное');
process.exit(bad ? 1 : 0);
