import { Wordmark } from './Wordmark';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

const WIDTH = { sm: 96, md: 120, lg: 160 } as const;

/**
 * 앱 로고 공유 컴포넌트.
 * 확정 UI의 STRIDE+ 워드마크(SVG)를 그린다. 색은 테마 공통 logo(#4B83B5).
 */
export function AppLogo({ size = 'md' }: Props) {
  return <Wordmark width={WIDTH[size]} />;
}
