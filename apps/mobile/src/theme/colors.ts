// 확정 UI 캔버스 팔레트 G 「스틸 차콜 + 딥 네이비」(2026-10-16 선정)
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
    bg: '#222529',
    header: 'rgba(31,34,38,0.96)',
    surface: '#292C31',
    surface2: '#34383E',
    border: '#3D4148',
    input: '#292C31',
    muted: '#7B8189',
    text: '#F6F7F9',
    text2: '#B8BEC6',
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
    stop: { ring: '#9DBFE0', track: '#2C3846', edge: 'rgba(157,191,224,0.35)' },
    map: {
      bg: '#45484E',
      dot: '#9DBFE0',
      dotBorder: '#0A0A0A',
      pulse: 'rgba(157,191,224,0.25)',
      clBg: '#0A0A0A',
      clRing: '#9DBFE0',
      clGlow: 'rgba(157,191,224,0.45)',
      meFill: '#FFFFFF',
      meRing: '#9DBFE0',
    },
  },
  light: {
    bg: '#FFFFFF',
    header: 'rgba(255,255,255,0.96)',
    surface: '#FFFFFF',
    surface2: '#EEF0F2',
    border: '#E3E6E9',
    input: '#EEF0F2',
    muted: '#9AA0A6',
    text: '#111316',
    text2: '#6B7079',
    accent: '#24476B',
    ink: '#FFFFFF',
    value: '#24476B',
    logo: '#4B83B5',
    danger: '#E5484D',
    shadow: '#111316',
    scrim: 'rgba(17,19,22,0.4)',
    ok: '#2E9E6B',
    warn: '#B45309',
    warnLine: '#E7B66F',
    stop: { ring: '#4B83B5', track: '#D3DCE6', edge: 'transparent' },
    map: {
      bg: '#F6F7F8',
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
