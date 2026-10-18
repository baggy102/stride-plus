// 확정 UI 타이포그래피: 본문 Pretendard, 수치 Barlow(Condensed). 모두 OFL (assets/fonts/LICENSE-*).
export const FONT = {
  regular: 'Pretendard-Regular',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  num: 'Barlow-SemiBold',
  numBold: 'Barlow-Bold',
  numCondensed: 'BarlowCondensed-SemiBold',
  numCondensedBold: 'BarlowCondensed-Bold',
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
};
