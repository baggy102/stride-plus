#!/usr/bin/env node
// PostToolUse 훅 — 허용 목록을 스스로 넓힌다.
//   1) notion-fetch 결과의 ancestor-path 에 이미 허용된 ID(홈·팀스페이스·DB·데이터 소스)가
//      있으면, 그 페이지 ID를 등록
//   2) notion-query-data-sources 로 허용된 데이터 소스를 조회하면, 결과 행 ID를 등록
//      (그 DB에 새로 생긴 행도 자동으로 포함된다)
//   3) 쓰기 도구가 성공하면 (= PreToolUse 를 통과했으니 stride+ 하위다) 응답 속 ID를 등록
// 등록은 append-only. 잘못 들어간 줄은 손으로 지우면 된다.

const fs = require('fs');
const path = require('path');

const ALLOWLIST = path.join(__dirname, '..', 'notion-allowed-ids.txt');
const ROOT = '1516785cbbb68074bb82f3f4413034fd'; // 🏠 stride+ 홈
const TEAM = '1516785cbbb68101a4e90042a28af9d3'; // stride+ teamspace

const WRITE_TOOLS = new Set([
  'notion-create-pages',
  'notion-duplicate-page',
  'notion-create-database',
  'notion-create-view',
  'notion-create-folder',
]);

const ID_RE = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi;
const norm = (s) => s.replace(/-/g, '').toLowerCase();

function loadAllowed() {
  if (!fs.existsSync(ALLOWLIST)) return new Set();
  return new Set(
    fs
      .readFileSync(ALLOWLIST, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*$/, '').trim())
      .filter(Boolean)
      .map(norm)
  );
}

function append(ids, note) {
  if (ids.length === 0) return;
  const lines = ids.map((id) => `${id}   # auto: ${note}`).join('\n');
  fs.appendFileSync(ALLOWLIST, `\n${lines}\n`, 'utf8');
}

function scan(text) {
  const m = String(text).match(ID_RE) || [];
  return [...new Set(m.map(norm))];
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolName = payload.tool_name || '';
  if (!toolName.startsWith('mcp__notion__')) process.exit(0);
  const short = toolName.replace('mcp__notion__', '');

  const body = JSON.stringify(payload.tool_response || '');
  const allowed = loadAllowed();
  const fresh = (ids) => ids.filter((id) => !allowed.has(id));

  if (short === 'notion-fetch') {
    // ancestor-path 안에 이미 허용된 ID(홈·팀스페이스·DB·데이터 소스)가 있을 때만 인정한다.
    const anc = body.match(/<ancestor-path>([\s\S]*?)<\?\/ancestor-path>/);
    const inScope =
      (anc && scan(anc[1]).some((id) => id === ROOT || id === TEAM || allowed.has(id))) ||
      body.includes(`<page url=\\"https://app.notion.com/p/${ROOT}\\"`);
    if (!inScope) process.exit(0);

    const target = scan((payload.tool_input || {}).id || '');
    append(fresh(target), 'fetch: stride+ 하위 확인됨');
    process.exit(0);
  }

  if (short === 'notion-query-data-sources') {
    // 조회 대상 데이터 소스가 전부 허용 목록에 있으면, 그 결과 행은 stride+ 하위다.
    const queried = scan(JSON.stringify((payload.tool_input || {}).data || ''));
    if (queried.length === 0 || !queried.every((id) => allowed.has(id))) process.exit(0);

    append(fresh(scan(body)), 'query: 허용된 데이터 소스의 행');
    process.exit(0);
  }

  if (WRITE_TOOLS.has(short)) {
    // PreToolUse 를 통과한 쓰기이므로 부모가 stride+ 하위다. 생성된 ID를 등록.
    append(fresh(scan(body)), `${short} 결과`);
  }

  process.exit(0);
});
