// 빌드 검사. 이 프로젝트는 번들링 없이 index.html을 바로 여는 정적 페이지라서,
// 열었을 때 깨질 수 있는 것만 확인한다.
//   1) index.html이 참조하는 로컬 파일이 모두 있는지 (외부 리소스 참조는 금지: 파일이 브라우저 밖으로 나가지 않는다는 약속)
//   2) 프로젝트의 모든 JS 파일이 문법적으로 올바른지
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const errors = [];

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (/^(?:[a-z]+:)?\/\//i.test(ref)) errors.push(`외부 리소스 참조 금지: ${ref}`);
  else if (!fs.existsSync(path.join(root, ref))) errors.push(`index.html이 참조하는 파일이 없음: ${ref}`);
}

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJs(full);
    return /\.[cm]?js$/.test(entry.name) ? [full] : [];
  });
}

const jsFiles = listJs(root);
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`문법 오류: ${path.relative(root, file)}\n${result.stderr.trim()}`);
}

if (errors.length) {
  console.error(`빌드 검사 실패 (${errors.length}건)\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`빌드 검사 통과: index.html 참조 ${refs.length}개, JS 파일 ${jsFiles.length}개`);
