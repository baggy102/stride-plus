// Frost Telemetry 팔레트(2026-10-27 확정, 캔버스 「Stride+ Frost Telemetry 화면 정의」 토큰 시트).
// 키 이름은 팔레트 G와 같고 값만 바뀌었다. 로고·버튼·Ice·Deep Ice는 유지.
export type Scheme = 'dark' | 'light';

export interface Palette {
  bg: string;
  header: string;
  surface: string;
  surface2: string;
  border: string;
  input: string; // 입력창 배경
  muted: string;
  text: string;
  text2: string;
  accent: string; // 버튼·활성 칩 배경
  ink: string; // accent 위 글자
  value: string; // 수치·마커·링크·스피너
  logo: string;
  danger: string;
  shadow: string;
  scrim: string; // 시트·다이얼로그 뒤 어둡게
  ok: string; // GPS 양호 점
  warn: string; // 경고 아이콘·글자
  warnLine: string; // 경고 배너 테두리
  stop: { ring: string; track: string; edge: string }; // 기록 종료 버튼(길게 누르기 진행 링)
  glass: string; // 서리 유리: 지도 위 시트·태그·칩·탭바에만(목록 카드에는 쓰지 않음)
  glassBorder: string;
  hair: string; // 수치 구분선
  grid: string; // 24px 격자(기록 중·요약 도면)
  navOn: string; // 활성 탭·토글 아이콘(다크에서 accent는 대비 부족)
  navOff: string;
  chipOnBg: string; // 활성 칩
  chipOnFg: string;
  headerFade: [string, string, string]; // 지도 위 헤더 세로 페이드(위 → 아래)
  map: {
    bg: string;
    dot: string;
    dotBorder: string;
    pulse: string;
    clBg: string;
    clRing: string;
    clGlow: string;
    meFill: string;
    meRing: string;
  };
}

export const palettes: Record<Scheme, Palette> = {
  dark: {
    bg: '#0B1016',
    header: 'rgba(11,16,22,0.92)',
    surface: '#121922',
    surface2: '#1A2430',
    border: '#222B36',
    input: '#121922',
    muted: '#8E9BA8',
    text: '#DCE6EE',
    text2: '#AEBBC7',
    accent: '#2F5D8A',
    ink: '#FFFFFF',
    value: '#9DBFE0',
    logo: '#4B83B5',
    danger: '#E5484D',
    shadow: '#000000',
    scrim: 'rgba(0,0,0,0.55)',
    ok: '#4CC38A',
    warn: '#FFC66B',
    warnLine: '#6B5A3A',
    stop: { ring: '#9DBFE0', track: '#1A2430', edge: 'rgba(157,191,224,0.35)' },
    glass: 'rgba(18,25,34,0.72)',
    glassBorder: 'rgba(220,230,238,0.16)',
    hair: 'rgba(157,191,224,0.30)',
    grid: 'rgba(157,191,224,0.06)',
    navOn: '#9DBFE0',
    navOff: '#8E9BA8',
    chipOnBg: '#DCE6EE',
    chipOnFg: '#0B1016',
    headerFade: ['rgba(11,16,22,0.92)', 'rgba(11,16,22,0.72)', 'rgba(11,16,22,0)'],
    map: {
      bg: '#16202B',
      dot: '#9DBFE0',
      dotBorder: '#0B1016',
      pulse: 'rgba(157,191,224,0.25)',
      clBg: '#0B1016',
      clRing: '#9DBFE0',
      clGlow: 'rgba(157,191,224,0.45)',
      meFill: '#DCE6EE',
      meRing: '#9DBFE0',
    },
  },
  light: {
    bg: '#F2F5F8',
    header: 'rgba(242,245,248,0.94)',
    surface: '#FFFFFF',
    surface2: '#E6ECF2',
    border: '#DDE4EB',
    input: '#E6ECF2',
    muted: '#94A0AC',
    text: '#0B1016',
    text2: '#5D6976',
    accent: '#24476B',
    ink: '#FFFFFF',
    value: '#24476B',
    logo: '#4B83B5',
    danger: '#E5484D',
    shadow: '#0B1016',
    scrim: 'rgba(17,19,22,0.4)',
    ok: '#2E9E6B',
    warn: '#B45309',
    warnLine: '#E7B66F',
    stop: { ring: '#4B83B5', track: '#D3DCE6', edge: 'transparent' },
    glass: 'rgba(255,255,255,0.80)',
    glassBorder: 'rgba(11,16,22,0.08)',
    hair: 'rgba(36,71,107,0.25)',
    grid: 'rgba(36,71,107,0.05)',
    navOn: '#24476B',
    navOff: '#5D6976',
    chipOnBg: '#24476B',
    chipOnFg: '#FFFFFF',
    headerFade: ['rgba(242,245,248,0.94)', 'rgba(242,245,248,0.76)', 'rgba(242,245,248,0)'],
    map: {
      bg: '#E9EEF3',
      dot: '#24476B',
      dotBorder: '#FFFFFF',
      pulse: 'rgba(36,71,107,0.25)',
      clBg: '#FFFFFF',
      clRing: '#24476B',
      clGlow: 'rgba(36,71,107,0.45)',
      meFill: '#24476B',
      meRing: '#FFFFFF',
    },
  },
};

// '#RRGGBB' → 'rgba(r,g,b,a)'
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// '#RRGGBB' → 'r g b' (NativeWind CSS 변수용)
export function toRgbChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
