// 확정 UI 타이포그래피: 본문 Pretendard, 수치 Barlow(Condensed), 라벨·날짜·단위 IBM Plex Mono(Frost). 모두 OFL (assets/fonts/LICENSE-*).
export const FONT = {
  regular: 'Pretendard-Regular',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  num: 'Barlow-SemiBold',
  numBold: 'Barlow-Bold',
  numCondensed: 'BarlowCondensed-SemiBold',
  numCondensedBold: 'BarlowCondensed-Bold',
  mono: 'IBMPlexMono-Regular',
  monoMedium: 'IBMPlexMono-Medium',
} as const;

// expo-font useFonts에 넘기는 파일 목록
export const FONT_ASSETS = {
  [FONT.regular]: require('../../assets/fonts/Pretendard-Regular.otf'),
  [FONT.semibold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
  [FONT.bold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  [FONT.num]: require('../../assets/fonts/Barlow_600SemiBold.ttf'),
  [FONT.numBold]: require('../../assets/fonts/Barlow_700Bold.ttf'),
  [FONT.numCondensed]: require('../../assets/fonts/BarlowCondensed_600SemiBold.ttf'),
  [FONT.numCondensedBold]: require('../../assets/fonts/BarlowCondensed_700Bold.ttf'),
  [FONT.mono]: require('../../assets/fonts/IBMPlexMono_400Regular.ttf'),
  [FONT.monoMedium]: require('../../assets/fonts/IBMPlexMono_500Medium.ttf'),
};

// Frost 라벨(TIME·PACE·KM·TOTAL 등): 모노 500, 대문자, 자간 0.12em. 한글이 섞이면 시스템 글꼴로 대체된다
export function monoLabel(size = 11, tracking = 0.12) {
  return { fontFamily: FONT.monoMedium, fontSize: size, letterSpacing: size * tracking } as const;
}
