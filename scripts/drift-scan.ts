#!/usr/bin/env ts-node
/**
 * drift-scan.ts — 기술 부채 스캐너
 * 실행: npx ts-node scripts/drift-scan.ts
 * CI: GitHub Actions drift-scan.yml 에서 자동 실행
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const ROOT = path.resolve(__dirname, '..');

interface Pattern {
  id: string;
  description: string;
  regex: RegExp;
  searchDir: string;
  extensions: string[];
  fix: string;
}

const PATTERNS: Pattern[] = [
  {
    id: 'process-env',
    description: 'process.env 직접 참조 (→ @nestjs/config 사용 강제)',
    regex: /process\.env\.\w+/,
    searchDir: 'apps/server/src',
    extensions: ['.ts'],
    fix: 'configService.get("KEY") 로 교체. AppModule에 ConfigModule.forRoot({ isGlobal: true }) 등록 확인.',
  },
  {
    id: 'async-storage',
    description: 'AsyncStorage 사용 (→ expo-secure-store 사용 강제)',
    regex: /AsyncStorage/,
    searchDir: 'apps/mobile',
    extensions: ['.ts', '.tsx'],
    fix: 'expo-secure-store의 SecureStore.setItemAsync / getItemAsync 로 교체.',
  },
  {
    id: 'geo-order',
    description: '[lat, lng] 좌표 순서 위반 (→ GeoJSON 표준: [lng, lat])',
    regex: /coordinates\s*:\s*\[\s*\blat\b|\[lat\s*,\s*lng\]/,
    searchDir: 'apps',
    extensions: ['.ts', '.tsx'],
    fix: 'GeoJSON 표준은 [경도(lng), 위도(lat)] 순서. coordinates: [run.lng, run.lat] 로 수정.',
  },
  {
    id: 'console-log',
    description: 'console.log 잔존 (→ 프로덕션 코드에서 제거)',
    regex: /console\.log\s*\(/,
    searchDir: 'apps',
    extensions: ['.ts', '.tsx'],
    fix: 'console.log 제거. 서버는 Logger(@nestjs/common), 모바일은 __DEV__ 조건부 처리.',
  },
];

interface Violation {
  file: string;
  line: number;
  match: string;
  pattern: Pattern;
}

function collectFiles(dir: string, extensions: string[]): string[] {
  const SKIP = new Set(['node_modules', 'dist', '.expo', '.next', 'coverage']);
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, extensions));
    else if (extensions.some(ext => entry.name.endsWith(ext))) results.push(full);
  }
  return results;
}

function scan(): Violation[] {
  const violations: Violation[] = [];

  for (const pattern of PATTERNS) {
    const dir = path.join(ROOT, pattern.searchDir);
    const files = collectFiles(dir, pattern.extensions);

    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(pattern.regex);
        if (match) {
          violations.push({
            file: path.relative(ROOT, file),
            line: i + 1,
            match: match[0],
            pattern,
          });
        }
      }
    }
  }

  return violations;
}

async function createIssue(title: string, body: string): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!repo || !token) {
    console.error('GITHUB_REPOSITORY 또는 GITHUB_TOKEN이 설정되지 않았습니다.');
    return;
  }

  const [owner, repoName] = repo.split('/');
  const payload = JSON.stringify({
    title,
    body,
    labels: ['tech-debt', 'drift'],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${owner}/${repoName}/issues`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'stride-plus-drift-scanner',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 201) {
            const issue = JSON.parse(data);
            console.log(`  ✓ Issue 생성: ${issue.html_url}`);
            resolve();
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function issueBody(violations: Violation[], pattern: Pattern): string {
  const lines = violations
    .map((v) => `- \`${v.file}:${v.line}\` — \`${v.match}\``)
    .join('\n');

  return [
    `## 감지된 패턴: ${pattern.description}`,
    '',
    `**위반 파일 (${violations.length}건)**`,
    lines,
    '',
    `**수정 방법**`,
    `> ${pattern.fix}`,
    '',
    `_자동 생성: drift-scan.ts (${new Date().toISOString()})_`,
  ].join('\n');
}

async function main(): Promise<void> {
  console.log('=== Stride+ Drift Scanner ===\n');

  const all = scan();

  if (all.length === 0) {
    console.log('위반 없음. 기술 부채 클린.\n');
    process.exit(0);
  }

  // 패턴별로 그룹화
  const byPattern = new Map<string, Violation[]>();
  for (const v of all) {
    const key = v.pattern.id;
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key)!.push(v);
  }

  let hasError = false;

  for (const [, violations] of byPattern) {
    const pattern = violations[0].pattern;
    console.log(`[drift] ${pattern.description}`);
    for (const v of violations) {
      console.log(`  ${v.file}:${v.line}  →  ${v.match}`);
    }
    console.log(`  수정: ${pattern.fix}\n`);

    const title = `[drift] ${pattern.description}`;
    try {
      await createIssue(title, issueBody(violations, pattern));
    } catch (e) {
      console.error(`  Issue 생성 실패: ${(e as Error).message}`);
      hasError = true;
    }
  }

  process.exit(hasError ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
