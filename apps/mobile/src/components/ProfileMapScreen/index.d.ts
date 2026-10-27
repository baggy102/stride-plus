import { ComponentType } from 'react';

export interface ProfileMapScreenProps {
  userId?: string;
  /** 방금 저장한 러닝 — 목록 보기로 열고 히어로가 File 전환으로 들어온다 */
  filedRunId?: string;
}

export declare const ProfileMapScreen: ComponentType<ProfileMapScreenProps>;
