#!/usr/bin/env node
// PreToolUse 훅 — Notion 쓰기 작업을 stride+ 팀스페이스 하위로 제한한다.
// 허용 목록에 없는 대상을 건드리면 exit 2 로 차단하고, 이유를 stderr 로 알린다.
// 읽기(search/fetch/query)는 건드리지 않는다.

const fs = require('fs');
const path = require('path');

const ALLOWLIST = path.join(__dirname, '..', 'notion-allowed-ids.txt');

const WRITE_TOOLS = new Set([
  'notion-create-pages',
  'notion-update-page',
  'notion-duplicate-page',
  'notion-move-pages',
  'notion-create-database',
  'notion-update-data-source',
  'notion-create-view',
  'notion-update-view',
  'notion-create-comment',
  'notion-create-attachment',
  'notion-create-folder',
  'notion-update-folder',
  'notion-convert-page-to-skill',
]);

// 대상 ID 를 담고 있는 키. 본문(content) 안에 섞인 멘션 링크는 일부러 무시한다.
const TARGET_KEY = /parent|page_id|page_or_database|data_source|database|collection|^id$|^url$|block_id/i;

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

function idsIn(value) {
  const found = new Set();
  const m = String(value).match(ID_RE);
  if (m) m.forEach((x) => found.add(norm(x)));
  return found;
}

// 대상 키 아래에 있는 ID 만 모은다. 하나도 없으면 입력 전체에서 긁는다.
function collectTargets(node, keyMatched, out) {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') {
    if (keyMatched) idsIn(node).forEach((x) => out.add(x));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v) => collectTargets(v, keyMatched, out));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    collectTargets(v, keyMatched || TARGET_KEY.test(k), out);
  }
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // 파싱 실패 시 통과 — 훅이 정상 작업을 막지 않게 한다.
  }

  const toolName = payload.tool_name || '';
  if (!toolName.startsWith('mcp__notion__')) process.exit(0);

  const short = toolName.replace('mcp__notion__', '');
  if (!WRITE_TOOLS.has(short)) process.exit(0);

  const input = payload.tool_input || {};
  const allowed = loadAllowed();

  let targets = new Set();
  collectTargets(input, false, targets);
  if (targets.size === 0) collectTargets(input, true, targets); // 폴백: 전체 스캔

  if (targets.size === 0) {
    console.error(
      `[notion-scope] ${short} 호출에서 대상 ID를 찾지 못해 차단했다. ` +
        `stride+ 하위의 명시적인 parent/page_id 를 지정할 것.`
    );
    process.exit(2);
  }

  const outside = [...targets].filter((id) => !allowed.has(id));
  if (outside.length > 0) {
    console.error(
      `[notion-scope] 차단: ${short} 의 대상 ${outside.join(', ')} 이(가) ` +
        `stride+ 팀스페이스 허용 목록에 없다.\n` +
        `stride+ 하위가 맞다면 먼저 notion-fetch 로 해당 ID를 조회할 것. ` +
        `ancestor-path 에 "stride+ 홈"(1516785cbbb68074bb82f3f4413034fd)이 있으면 ` +
        `PostToolUse 훅이 .claude/notion-allowed-ids.txt 에 자동 등록하고, 그 후 재시도하면 통과한다.\n` +
        `stride+ 하위가 아니라면 이 작업을 수행하지 말고 사용자에게 알릴 것.`
    );
    process.exit(2);
  }

  process.exit(0);
});
