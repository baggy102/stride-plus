// 토큰 갱신(단일 비행)과 「세션이 확실히 끝났는가」 판단. axios·저장소 없이 테스트할 수 있게 client.ts와 나눴다(session.test.mjs).

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** 확실한 인증 실패 — 토큰을 버리고 로그인 화면으로 보낸다. 네트워크 오류·시간 초과·5xx는 해당하지 않는다 */
export function isDefinitiveAuthStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/** 시작 확인(갱신 → GET /users/me)이 실패했을 때 로그아웃할지. 인증 실패와 「다른 기기에서 지운 계정」만 로그아웃한다 */
export function endsSession(status: number | undefined, message: unknown): boolean {
  return isDefinitiveAuthStatus(status) || (status === 404 && message === 'user_not_found');
}

export interface RefresherDeps<R extends TokenPair> {
  readRefreshToken: () => Promise<string | null>;
  /** POST /auth/refresh. 자체 시간 제한이 있어야 한다 — 기다리는 요청이 모두 이 결과를 기다린다 */
  post: (refreshToken: string) => Promise<R>;
  save: (result: R) => Promise<void>;
  /** 갱신이 확실히 거절됐을 때(401·403·refresh 토큰 없음): 토큰을 지우고 로그인 화면으로 */
  endSession: () => Promise<void>;
  statusOf: (error: unknown) => number | undefined;
}

/**
 * 갱신은 한 번에 하나만 보낸다. refresh 토큰은 쓰면 바뀌므로(서버가 회전) 두 번 겹쳐 보내면 뒤의 것이 401로 세션을 끝낸다.
 * 동시에 부른 쪽은 모두 같은 결과를 받는다 — 시간 초과로 실패하면 기다리던 요청도 같은 오류로 바로 끝난다.
 */
export function createRefresher<R extends TokenPair>(deps: RefresherDeps<R>) {
  let inFlight: Promise<R> | null = null;

  async function run(): Promise<R> {
    const refreshToken = await deps.readRefreshToken();
    if (!refreshToken) {
      await deps.endSession().catch(() => {});
      throw new Error('no_refresh_token');
    }
    let result: R;
    try {
      result = await deps.post(refreshToken);
    } catch (error) {
      // 네트워크 오류·시간 초과·5xx는 토큰을 그대로 둔다 — 다음 요청이나 다음 활성화 때 다시 갱신한다
      if (isDefinitiveAuthStatus(deps.statusOf(error))) await deps.endSession().catch(() => {});
      throw error;
    }
    await deps.save(result);
    return result;
  }

  return {
    refresh(): Promise<R> {
      if (!inFlight) inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
    /** 진행 중인 갱신(없으면 null) */
    pending(): Promise<R> | null {
      return inFlight;
    },
  };
}
