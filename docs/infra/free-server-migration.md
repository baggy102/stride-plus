# Stride+ API 상시 무료 서버 이전 계획

- 작성일: 2026-11-24. 조사만 했고 저장소와 클라우드 자원은 바꾸지 않았다.
- 범위: 사용자 요청(「aws말고 azure나 다른데서 무료로 제공한대」)에 따라 **AWS 밖으로** 옮긴다. AWS Lambda 등 AWS 상시 무료 선택지는 사용자 요청으로 제외했다. AWS 정보는 정리 마감일(2027-04-18)을 정하는 데만 쓴다.
- 표기
  - [공식 문서]: 공식 페이지 본문을 직접 읽었다(URL 첨부).
  - [검색 요약]: 공식 URL을 찾았지만 본문을 열지 못했다. 검색 엔진 요약을 근거로 썼다.
  - [추정]: 계산이나 경험에 기댄 값이다.
  - [코드]: 저장소에서 직접 확인했다.
- **확인 한계**: 이 세션의 네트워크 정책 때문에 `docs.oracle.com`, `docs.aws.amazon.com`을 열 수 없었고, 그 뒤로 다른 사이트도 열지 않았다. AWS 규칙은 AWS 공식 문서 도구로 본문을 읽었다([공식 문서]). 나머지 사업자 정보는 거의 [검색 요약]이다. 결정 전에 링크를 직접 열어 숫자를 한 번 더 확인한다. `learn.microsoft.com`, `docs.oracle.com`, `mongodb.com`, `developers.cloudflare.com`을 허용하면 [공식 문서]로 올릴 수 있다.

---

## 1. 요약: 권장 구조 (5줄)

1. **서버**: Oracle Cloud Always Free VM(홈 리전 서울 또는 춘천, AMD `E2.1.Micro` 또는 Ampere A1) + Docker + Caddy(자동 HTTPS). 한국에서 「완전 무료 + 상시 가동 + 국내 지연」을 모두 만족하는 곳은 이것뿐이다.
2. **DB**: MongoDB Atlas M0을 그대로 쓰고 한국 리전으로 옮긴다(M0을 지원하는 리전이 있을 때). 코드는 바꾸지 않는다.
3. **파일**: 사진은 Cloudflare R2(10 GB 무료, 송신 무료)로 옮긴다. 지도 PMTiles는 VM의 Caddy가 국내에서 내주고, R2에 사본을 둔다.
4. **배포**: GitHub Actions(공개 저장소 무료) → GHCR → SSH 배포. 비밀값은 VM의 `.env`와 GitHub Secrets에 둔다. CodeBuild와 SSM을 대체한다.
5. **예비**: Azure Container Apps(Korea Central)를 평소 0대로 둔다(비용 $0). 장애 때 DNS만 돌린다. AWS는 **2027-03-31까지** 정리한다(무료 플랜 만료 2027-04-18).

**Azure 결론(사용자 질문에 대한 답)**: Azure에는 상시 가동 컨테이너를 영구 무료로 돌릴 수 있는 상품이 없다.
- Container Apps를 무료로 쓰려면 0대로 줄였다가 켜야 하므로 **콜드 스타트**가 생긴다.
- 1대를 계속 켜 두면 무료 한도를 넘어 **월 약 $4~14**가 든다(4-2 계산).
- App Service F1은 하루 CPU 60분 제한이 있고 Always On과 사용자 도메인을 지원하지 않는다.
- VM 무료는 12개월뿐이다.

그래서 Azure는 주 서버가 아니라 **예비(B안)** 로 권한다.

---

## 2. 현재 구성과 비용

| 구성 요소 | 지금 | 비용·비고 |
|---|---|---|
| API | NestJS(Node 20) Docker, Lightsail Container Service `stride-api`, micro(0.25 vCPU, 1 GB), 1대, ap-southeast-2(시드니). 헬스 체크 `GET /api` | $10/월. 11월 사용액 $4.98, 거의 Lightsail |
| 배포 | CodeBuild `stride-api`가 `apps/server/buildspec.yml`을 실행. 수동 시작 | 크레딧 안 |
| 비밀값 | SSM `/stride/*` 6개(MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). 배포 때 `S3_REGION`을 더한다 [코드] | 표준 파라미터 |
| DB | Atlas(mongodb+srv). 티어·리전 모름. 러닝 약 8개 | M0이면 $0 |
| 사진 | S3 ap-southeast-2, 약 1.6 MB. 앱에는 `/uploads/<이름>`을 주고, 서버가 1시간짜리 서명 URL로 302 넘긴다 [코드] | 거의 0 |
| 지도 타일 | Protomaps 호스팅 API(ZXY, 키가 앱에 들어 있음). 상업 이용은 스폰서가 필요하다(FOLLOWUP B-2) | — |
| 앱 API 주소 | `eas.json` `build.production.env.EXPO_PUBLIC_API_URL` = Lightsail 기본 주소. `app.config.js`가 `extra.apiUrl`에 넣는다. OTA로 바꿀 수 있다(`runtimeVersion.policy = appVersion`) [코드] | — |
| AWS 계정 | 새 Free 플랜. 크레딧 $95.02 남음. **2027-04-18 만료** | 아래 규칙 |

**AWS Free 플랜 만료 규칙** [공식 문서]
- Free 플랜은 「가입 6개월 뒤」와 「크레딧 소진」 중 **먼저 오는 때** 끝난다. 만료되면 계정에 접근할 수 없다.
- 만료 통지 뒤 **90일 안에** Paid 플랜으로 올리지 않으면 계정을 영구히 닫고 콘텐츠와 자원을 지운다.
- 남은 크레딧은 Paid로 올릴 때만 이어진다.
- 출처
  - https://aws.amazon.com/free/terms/ (Last Updated 2025-07-09)
  - https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html
  - https://aws.amazon.com/free/free-tier-faqs/ (Q5)
- 크레딧이 먼저 바닥나도 계정이 닫힌다. 지금 속도($5~10/월)면 4월까지 크레딧이 남는다 [추정].

**서버가 실제로 필요한 것** [코드]
- 환경 변수: 위 7개. 바꿀 때는 `S3_ENDPOINT` 추가가 필요하다(5-7).
- 상시 작업: 타이머·크론·WebSocket이 없다. HTTP만 쓴다. 그래서 「0대로 줄이기」 자체는 기술적으로 가능하다.
- 업로드: multer `memoryStorage`, 사진 1장 10 MB까지. 메모리를 순간적으로 쓴다.
- 네이티브 모듈: `bcrypt` 6.0.0. `prebuilds/linux-arm64`가 있어 Ampere(ARM) 이미지에서도 돈다. Dockerfile은 `--ignore-scripts`라 prebuild에 기댄다.
- DB 기능: `2dsphere` 인덱스 2개, `$near` [코드 `runs.schema.ts:56-59`, `runs.service.ts:31`]. 운영 스크립트 `n1-weekly.js`는 `$dateTrunc`(MongoDB 5.0+)를 쓴다.
- 앱 요청 제한 시간: **10초**(`REQUEST_TIMEOUT_MS = 10_000`). 콜드 스타트가 10초를 넘으면 첫 요청이 실패한다.
- **Node 20은 2026-04-30에 지원이 끝났다**(보안 패치 없음) [검색 요약: https://dev.to/matheus_releaserun/nodejs-20-end-of-life-migration-playbook-for-april-30-2026-2onh 등 여러 곳이 같은 날짜]. 이전할 때 `node:22` 또는 `node:24`로 올린다(별도 PR).

---

## 3. 구성 요소별 비교

지연은 모두 **[추정]** 이다. 서울 기준 왕복 시간(RTT)이며 통신사와 시간대에 따라 달라진다.
- 국내(서울·춘천): 2~10 ms
- 도쿄: 30~40 ms
- 싱가포르: 70~90 ms
- 시드니(지금): 130~160 ms
- 미국 서부: 120~150 ms
- 미국 중부: 150~180 ms
- 미국 동부: 180~220 ms
- 프랑크푸르트: 230~280 ms

### 3-1. 서버(컴퓨팅)

| 순위 | 후보 | 무료 한도 | 슬립·콜드 스타트 | 한국 지연[추정] | Docker·Node 20 | 카드 | 노력 | 위험 | 출처 |
|---|---|---|---|---|---|---|---|---|---|
| **1** | **Oracle Always Free VM**(홈 리전 서울 `ap-seoul-1` 또는 춘천 `ap-chuncheon-1`) | AMD `E2.1.Micro` 2대, 또는 Ampere A1 **2 OCPU·12 GB**(1,500 OCPU시간·9,000 GB시간/월). **2026-06에 4 OCPU·24 GB에서 반으로 줄었다** [검색 요약]. 송신 월 10 TB [검색 요약] | 없음(상시 VM). 대신 **유휴 회수**: 7일 동안 CPU 95백분위 < 20%, 네트워크 < 20%, 메모리 < 20%(A1만)이면 「유휴」로 보고 멈출 수 있다 [검색 요약] | 2~10 ms | Docker 그대로 | 가입 때 필요[추정] | 중(OS·보안 업데이트 직접) | 유휴 회수, 용량 부족(춘천 A1 한도 0 보고), 예고 없는 계정 정지 보고, 정책 변경 | [검색 요약] https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm , https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/ , https://community.oracle.com/customerconnect/discussion/964620 |
| **2** | **Azure Container Apps**(Korea Central), 0대까지 줄임 | 구독당 월 180,000 vCPU초 + 360,000 GiB초 + 200만 요청 [검색 요약] | **있음.** 0대에서 깨어나는 데 5~20초[추정]. 앱 제한 시간 10초를 넘을 수 있다 | 2~10 ms + 콜드 스타트 | Docker 그대로 | 필요(PAYG 구독) | 낮음(TLS·OS 관리형) | 콜드 스타트, 1대 상시면 유료(4-2) | [검색 요약] https://azure.microsoft.com/pricing/details/container-apps/ , https://learn.microsoft.com/azure/container-apps/billing |
| 2′ | Azure Container Apps, 1대 상시 | 위와 같다. 한도는 0.25 vCPU 1대 기준 **약 200시간(8.3일)** 분량 | 없음 | 2~10 ms | Docker | 필요 | 낮음 | **월 약 $4~14**(4-2) | 같음 |
| 3 | Google Cloud e2-micro | 미국 3개 리전(us-west1·us-central1·us-east1)에서 1대. 디스크 30 GB. **북미 → 외부 송신 월 1 GB** [검색 요약] | 없음 | 120~180 ms | Docker | 필요 | 중 | 송신 1 GB 초과(지도 응답 0.6~0.7 MB면 약 1,500회), 지연 | [검색 요약] https://cloud.google.com/free/docs/compute-getting-started |
| 4 | Google Cloud Run(서울 `asia-northeast3`) | 요청 기반 월 180,000 vCPU초·360,000 GiB초·200만 요청(Tier 1 기준). 서울의 가격 등급은 확인 못 함(Tier 2면 더 적다) | 있음(0대) | 2~10 ms + 콜드 스타트 | Docker | 필요 | 낮음 | Azure 2번과 같은 성격 | [검색 요약] https://cloud.google.com/run/pricing |
| 5 | Northflank Developer Sandbox | 상시 서비스 2개, DB 1개, 크론 2개, 슬립 없음, 카드 불필요(제3자 자료) | 없음(보고) | 리전 미확인. 미국·유럽이면 150~280 ms | Docker | 불필요(보고) | 낮음 | 한도·리전 미확인, 정책 변경 | [검색 요약] https://northflank.com/pricing |
| 6 | Azure App Service F1 | 하루 CPU 60분, 1 GB RAM, 1 GB 저장. **Always On 없음, 사용자 도메인 없음**(B1부터). F1 Linux 컨테이너 지원은 불확실 | 있음(유휴 시 언로드) | 2~10 ms | 불확실 | 필요 | 낮음 | CPU 60분/일이면 운영 불가 | [검색 요약] https://learn.microsoft.com/en-us/troubleshoot/azure/app-service/connection-issues-with-ssl-or-tls/troubleshoot-custom-domain-issues-azure-app-service |
| 7 | Azure Functions(Flex Consumption) | 월 100,000 GB초 + 25만 실행(Flex). Linux Consumption(400,000 GB초, 100만 실행)은 2028-09-30에 끝난다 | 있음 | 2~10 ms + 콜드 스타트 | NestJS 어댑터가 필요하다(코드 변경) | 필요 | 높음 | 코드 재구성, 콜드 스타트 | [검색 요약] https://azure.microsoft.com/pricing/details/functions/ , https://learn.microsoft.com/azure/azure-functions/functions-scale |
| 8 | Azure VM B1s / B2ats v2 / B2pts v2 | **12개월만** 무료(월 750시간 + P6 디스크). B1s는 여러 리전에서 단계적으로 없어지는 중이다 | 없음 | 2~10 ms | Docker | 필요 | 중 | 12개월 뒤 유료. 신규 고객만 | [검색 요약] https://learn.microsoft.com/en-us/answers/questions/5778558 |
| — | Azure for Students | $100 크레딧, 12개월, 카드 불필요. 학생이면 매년 갱신. 위 VM 3종 750시간 포함 | — | — | — | 불필요 | — | 정규 대학생만 | [검색 요약] https://learn.microsoft.com/en-us/azure/education-hub/about-azure-for-students |
| ✕ | Render Free | 월 750시간 | **15분 무요청이면 잠들고, 깨는 데 최대 1분** | 싱가포르면 70~90 ms(무료 가능 여부 미확인) | Docker | 불필요 | 낮음 | 앱 제한 시간 10초를 넘는다 | [검색 요약] https://render.com/docs/free |
| ✕ | Koyeb Free | 1개, 0.1 vCPU·512 MB, 프랑크푸르트·워싱턴만 | **1시간 무요청이면 0대** | 180~280 ms | Docker | 2026-02부터 필요(제3자) | 낮음 | 슬립, 지연 | [검색 요약] https://www.koyeb.com/docs/faqs/pricing |
| ✕ | Zeabur Free | — | 잠든다. **비상업 전용** | — | — | 불필요 | — | 상업 이용 불가 | [검색 요약] https://zeabur.com/docs/pricing/free-plan |
| ✕ | Fly.io / Railway | Fly.io는 신규 무료 없음(체험판만). Railway는 체험 크레딧 뒤 월 $1 크레딧(자료마다 다름) | — | — | — | — | — | 상시 무료 아님 | [검색 요약] 제3자 비교 글만 확인 |
| ✕ | Cloudflare Workers | 하루 10만 요청, **요청당 CPU 10 ms**, 메모리 128 MB | 없음(아이솔레이트) | 라우팅에 따라 다름 | NestJS·`bcrypt` 네이티브가 돌지 않는다[추정] | 불필요 | 매우 높음 | 재작성 필요 | [검색 요약] https://developers.cloudflare.com/workers/platform/limits |
| ✕ | AWS Lambda 등 | — | — | — | — | — | — | **사용자 요청으로 제외** | — |

**정리**
- 「상시 무료 + 잠들지 않음 + 국내 지연」 세 가지를 모두 만족하는 후보는 **Oracle**뿐이다. 대신 계정과 회수 위험이 가장 크다.
- 위험이 가장 낮은 것은 Azure Container Apps다. 다만 무료로 쓰면 콜드 스타트가 생기고, 상시 가동은 유료다.

### 3-2. DB

| 후보 | 무료 한도 | 한국 리전 | 2dsphere·`$near` | 코드 변경 | 위험 | 출처 |
|---|---|---|---|---|---|---|
| **Atlas M0 유지(권장)** | 저장 512 MB, 초당 100 작업, 연결 500개, **송수신 각각 7일 이동 창마다 10 GB**(넘으면 속도 제한), 프로젝트당 M0 1개, 유휴 M0은 비활성화될 수 있음 [검색 요약] | **GCP 서울(`asia-northeast3`)은 2021년 changelog에 Free 추가 기록이 있다.** AWS 서울(`ap-northeast-2`)과 Azure Korea Central은 표에서 Free 지원 칸을 읽지 못했다. Atlas 생성 화면은 Free 가능 리전만 보여 주므로 거기서 확인한다 [검색 요약] | 원본 MongoDB라 그대로 된다 | 없음 | 송신 10 GB/7일(아래), 백업 | [검색 요약] https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/ , https://www.mongodb.com/docs/atlas/release-notes/changelog/ , https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/ |
| Azure Cosmos DB for MongoDB(RU) 무료 등급 | **1,000 RU/s + 25 GB, 계정 수명 동안**, 구독당 1개. 공유 처리량으로 컬렉션들이 나눠 쓴다 [검색 요약] | Korea Central 가능[추정] | 2dsphere·`$near` 지원 표기. 다만 MS 문서가 「네이티브 공간 인덱스는 MongoDB 2dsphere와 동등하지 않고, 질의 계획·성능이 다를 수 있다」고 쓴다 [검색 요약]. `$dateTrunc`는 RU 지원 표에서 확인 못 함 | 연결 문자열만. 단 RU 한도 초과 오류(429/16500) 재시도 처리가 필요할 수 있다 | **RU 고갈**: 지도 피드 한 번에 Mongo에서 0.6~0.7 MB를 읽는다(FOLLOWUP A-2). 1 KB 읽기 ≈ 1 RU라면 한 번에 수백 RU라, 1,000 RU/s를 동시 요청 몇 개가 다 쓴다[추정] | [검색 요약] https://learn.microsoft.com/azure/cosmos-db/free-tier , https://learn.microsoft.com/azure/cosmos-db/mongodb/indexing , https://learn.microsoft.com/azure/cosmos-db/mongodb/feature-support-70 |
| Azure DocumentDB(구 Cosmos DB for MongoDB vCore) 무료 등급 | 32 GB, 수명 동안, 구독당 1개, HA·백업 없음, **60일 무활동이면 일시 정지** [검색 요약] | 무료 리전 목록에 한국이 보이지 않았다(일본 동·서부, 동아시아는 있음) | vCore는 지리 기능을 내세우지만 무료 등급에서 확인하지 못했다 | 연결 문자열 | 리전, 호환성 | [검색 요약] https://learn.microsoft.com/azure/documentdb/free-tier |

**M0 송신 한도 계산** [추정]
- 10 GB ÷ 0.65 MB ≈ 15,000회/7일, 즉 하루 약 2,200회 지도 피드 호출에서 막힌다.
- 테스터 단계에서는 여유가 있다. 다만 DAU가 수백 명이 되면 FOLLOWUP Part A(읽는 양 줄이기)나 Flex 등급이 필요하다.

**백업**
- M0 백업은 「매일 스냅숏, 최근 4개 보관」이 생겼지만 **비공개 미리보기**라 메뉴가 안 보일 수 있다 [검색 요약: https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/].
- 그래서 `mongodump`로 따로 백업한다(5-10).

### 3-3. 사진(객체 저장소)

| 후보 | 무료 | 송신 | S3 SDK | 위험 | 출처 |
|---|---|---|---|---|---|
| **Cloudflare R2(권장)** | **10 GB-월, 쓰기(Class A) 100만, 읽기(Class B) 1,000만/월, 영구** | 무료 | 된다. `endpoint=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `region: 'auto'`. 서명 URL은 클라이언트에서 만들어진다 | 결제 수단 등록 필요 여부 미확인. 초과 요금에 상한이 없다. SDK v3 새 버전의 체크섬 기본값 때문에 `requestChecksumCalculation: 'WHEN_REQUIRED'`가 필요할 수 있다(`DeleteObjects` 확인 필요) | [검색 요약] https://developers.cloudflare.com/r2/pricing , https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/ , https://developers.cloudflare.com/r2/api/s3/presigned-urls/ |
| Oracle Object Storage | 20 GiB(Standard+Archive 합계). 요청 수 한도(옛 자료 월 5만)는 최신 확인 못 함 | 월 10 TB까지 무료 | S3 호환 API | VM과 같은 계정이라 정지되면 같이 사라진다 | [검색 요약] https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm |
| Azure Blob | **12개월만** 5 GB LRS Hot + 읽기 2만·쓰기 1만/월. 상시 무료 아님 | 인터넷 송신 월 100 GB 무료(모든 고객) | S3 SDK가 아니다(코드 변경) | 12개월 뒤 유료 | [검색 요약] https://azure.microsoft.com/pricing/free-services/ , https://azure.microsoft.com/pricing/details/bandwidth/ |

### 3-4. 지도 타일(FOLLOWUP Part B와 연결)

- FOLLOWUP Part B는 「S3 서울 + CloudFront」를 권했다. 이번에 AWS를 빼므로 대안이 필요하다.
- 앱은 URL이 `.pmtiles`로 끝나기만 하면 코드 변경 없이 OTA로 바꿀 수 있다(FOLLOWUP B-1).

| 후보 | 무료 범위 | 한국 지연 | 주의 | 출처 |
|---|---|---|---|---|
| **T1. VM의 Caddy가 PMTiles 서빙(권장 기본)** | Oracle 송신 월 10 TB. DAU 1천이면 월 약 120 GB(FOLLOWUP B-3) | 국내 2~10 ms × 2~3회(헤더 → 디렉터리 → 타일)[추정] | CDN이 없다. VM이 죽으면 지도도 멈춘다 → R2 사본으로 OTA 전환 | — |
| T2. R2 + 사용자 도메인(Cloudflare) | 읽기 1,000만/월. **한국 추출 파일(1~4 GB 추정)은 Free 플랜 캐시 한도 512 MB를 넘어 엣지에 캐시되지 않는다.** 그래서 범위 요청마다 R2 읽기 1회가 든다. DAU 약 3,300명에서 1,000만에 닿는다[추정] | **Free 플랜 한국 트래픽이 도쿄·홍콩·미국 서부로 가는 사례가 보고됐다** [검색 요약] | r2.dev 주소는 운영용이 아니다. 도메인을 연결하면 버킷이 공개된다 | [검색 요약] https://developers.cloudflare.com/cache/concepts/default-cache-behavior/ , https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/ , https://blog.cloudflare.com/bandwidth-costs-around-the-world/ , https://gist.github.com/premist/e7bc1f3892c9643b08ba |
| T3. R2 + Protomaps Worker(ZXY) | Workers 무료는 하루 10만 요청(DAU 약 1천). 타일별 응답이라 엣지 캐시가 된다 | T2와 같은 라우팅 문제 | 한도를 넘으면 Workers 유료($5/월) | [검색 요약] https://docs.protomaps.com/deploy/cloudflare |

- 권장: T1을 기본으로 하고, 같은 파일을 R2에도 올려 둔다.
- 확정은 FOLLOWUP B-8의 서울 curl 측정으로 한다. R2 쪽은 `https://<도메인>/cdn-cgi/trace`의 `colo=`로 서빙 PoP를 본다.
- Protomaps 호스팅 API의 상업 이용 문제(FOLLOWUP B-2)도 이 전환으로 함께 정리된다.

### 3-5. 배포·비밀값

| 항목 | 권장 | 근거 |
|---|---|---|
| 빌드 | GitHub Actions. 공개 저장소는 표준 러너가 무료·무제한이다. **ARM 러너 `ubuntu-24.04-arm`도 공개 저장소에 무료**(2025-08 GA) | [검색 요약] https://docs.github.com/en/actions/reference/runners/github-hosted-runners , https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/ |
| 이미지 저장소 | GHCR. 공개 패키지로 둔다. 이미지에 비밀값이 없어야 한다: 지금 Dockerfile은 비밀값을 넣지 않는다 [코드] | [추정] 비공개 패키지는 저장 용량을 쓴다 |
| 배포 방식 | Oracle: SSH로 `docker compose pull && up -d`. Azure: OIDC 로그인 후 `az containerapp update --image` | — |
| 비밀값 | Oracle: `/opt/stride/.env`(권한 600). 원본은 사용자 비밀번호 관리자에 둔다. CI에는 SSH 키와 호스트만 넣는다. Azure: Container Apps 비밀값(무료). Key Vault 참조도 되지만(관리 ID 필요) 소규모에는 과하다 | [검색 요약] https://learn.microsoft.com/azure/container-apps/manage-secrets |
| 주의 | 공개 저장소의 예약(cron) 워크플로는 **60일 동안 저장소 활동이 없으면 자동으로 꺼진다** → 백업 같은 정기 작업은 VM의 systemd 타이머로 돌린다 | [검색 요약] https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow |

### 3-6. HTTPS·주소

| 방법 | 비용 | 한국 지연 | 판단 |
|---|---|---|---|
| **사용자 도메인 `api.<도메인>` + Caddy(Let's Encrypt), DNS만(프록시 끔)(권장)** | 도메인 연 $10~15[추정]. 「상시 무료」의 유일한 예외 | 직접 연결 | **앱 주소가 마지막으로 바뀐다.** 다음에 서버를 옮길 때는 DNS만 바꾸면 된다 |
| DuckDNS 같은 무료 하위 도메인 + Caddy | $0 | 직접 연결 | 제3자 서비스에 기대고, 주소의 신뢰도가 낮다 |
| Cloudflare Tunnel | $0. 단 named tunnel은 **Cloudflare에 있는 도메인이 필요하다**. Quick Tunnel은 테스트용이다(동시 200 요청, 주소가 바뀜) | Free 플랜 라우팅 문제가 생길 수 있다 | 인바운드 포트를 못 열 때만 쓴다 [검색 요약] https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ |
| Azure 기본 주소 `*.azurecontainerapps.io` | $0, TLS 포함 | 직접 연결 | B안에서만 |
| Azure Container Apps 무료 관리형 인증서 | $0 | — | CNAME이 앱 기본 도메인을 **직접** 가리켜야 하고, 이 조건이 갱신 때도 계속 맞아야 한다 [검색 요약] https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates |

### 3-7. 모니터링·백업

| 항목 | 권장 | 근거 |
|---|---|---|
| 가동 확인 | UptimeRobot 무료: 모니터 50개, 5분 간격. 공식 도움말은 상업 이용도 허용한다고 쓴다(반대 주장 블로그 있음). `https://api.<도메인>/api`를 본다 | [검색 요약] https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan |
| DB 알림 | Atlas 기본 알림(연결 수, 디스크) | — |
| DB 백업 | VM의 systemd 타이머가 매일 `mongodump --archive --gzip`을 돌린다 → `age`로 암호화 → R2 비공개 버킷에 14일 보관. **위치 데이터이므로 GitHub 아티팩트에 두지 않는다** | [추정] |
| VM 백업 | VM에는 고유 데이터를 두지 않는다. DB는 Atlas, 사진은 R2에 있다. 설정(compose, Caddyfile)은 저장소에, `.env`는 비밀번호 관리자에 둔다. **30분 안에 새로 만들 수 있게** 해 두는 것이 백업이다 | [추정] |

---

## 4. 권장 구조와 예비안

### 4-1. A안(권장): Oracle + Atlas + R2

```
[앱(TestFlight)] ──HTTPS──> api.<도메인> (DNS A, 프록시 끔)
                                 │
                   Oracle VM(서울/춘천, Always Free)
                   ├─ Caddy :443 (Let's Encrypt, gzip)
                   │    ├─ api.<도메인>   → stride-api:3000 (Docker, GHCR 이미지)
                   │    └─ tiles.<도메인> → /srv/tiles/korea-YYYYMMDD.pmtiles (Range, CORS)
                   └─ systemd 타이머: 매일 mongodump → 암호화 → R2
          ├──> MongoDB Atlas M0 (한국 리전 가능하면 서울, 아니면 도쿄)
          └──> Cloudflare R2 (사진 + PMTiles 사본 + DB 백업), 서명 URL 302
GitHub Actions(공개 저장소 무료) → GHCR → SSH 배포
```

- 월 비용: **$0**. 도메인을 사면 연 $10~15.
- 셰이프 고르기
  - 1순위는 AMD `E2.1.Micro`다. x86이라 지금 이미지가 그대로 돈다.
  - RAM이 1 GB라 스왑 2 GB를 둔다. NestJS 상주 메모리는 150~250 MB로 추정한다 [추정].
  - A1(2 OCPU·12 GB) 용량이 잡히면 A1이 더 넉넉하다. 이미지는 ARM 러너로 빌드한다.
- PAYG 업그레이드(카드 등록, Always Free 한도 안이면 $0)
  - 유휴 회수와 정지 위험을 줄인다는 보고가 있다.
  - 다만 A1 축소가 PAYG에도 적용되는지, 회수에서 빠지는지는 **공식 확인을 못 했다** [검색 요약: InfoQ 기사도 「상충」이라고 씀].
  - 올린다면 예산 알림(예: $1)을 함께 건다.

### 4-2. B안(예비): Azure Container Apps(Korea Central) + 같은 Atlas·R2

- 같은 GHCR 이미지, 같은 `.env` 값(Container Apps 비밀값)을 쓴다. DB와 사진이 밖에 있으므로 **전환은 DNS 한 줄**이다.
- 평소: `--min-replicas 0`. 쓰지 않으면 $0이다.
- 장애 때: `api.<도메인>` CNAME을 Azure 기본 주소로 바꾸고, 사용자 도메인과 관리형 인증서를 붙인다. 인증서가 나오기 전까지 잠깐 TLS 오류가 날 수 있다. 급하면 OTA로 Azure 기본 주소를 바로 넣는다.

**1대 상시로 운영할 때 비용 계산** [추정]
- 단가: 2025년 MS 커뮤니티 글의 Central US PAYG 단가를 썼다 [검색 요약]. 활성 vCPU $0.000024/초, 유휴 vCPU $0.000003/초, 메모리 $0.000003/GiB초. Korea Central 단가는 확인 못 했다.
- 조건: 0.25 vCPU · 0.5 GiB, 30일(2,592,000초).

| 항목 | 사용량 | 무료 | 과금 대상 | 모두 유휴일 때 | 모두 활성일 때 |
|---|---|---|---|---|---|
| vCPU초 | 648,000 | 180,000 | 468,000 | $1.40 | $11.23 |
| GiB초 | 1,296,000 | 360,000 | 936,000 | $2.81 | $2.81 |
| 요청 | 테스터 규모 | 200만 | 0 | $0 | $0 |
| **합계/월** | | | | **약 $4.2** | **약 $14.0** |

- 「유휴」 조건: CPU < 0.01 코어 **그리고** 수신 < 1,000 바이트/초 [검색 요약]. 테스터 규모면 대부분 유휴라 **월 $4~6 안팎**으로 본다 [추정].
- 0대 운영이면 켜져 있는 시간이 월 200시간(하루 약 6.7시간) 안일 때 무료다. 요청마다 쿨다운(기본 300초)이 붙는다는 점을 감안한다 [추정].
- 그 밖에 피할 비용
  - Log Analytics: `--logs-destination none`으로 수집을 끈다(실시간 로그 스트림은 된다). [검색 요약] https://learn.microsoft.com/azure/container-apps/log-options
  - Azure Container Registry: GHCR을 쓰면 필요 없다. ACR Standard는 신규 계정 12개월만 무료다 [검색 요약].
  - Azure 인터넷 송신: 월 100 GB 무료 [검색 요약].

### 4-3. 다른 조합

- **C안**: GCP e2-micro(미국) + Atlas + R2. 상시 무료이고 잠들지 않지만 지연이 120~180 ms이고, 송신 1 GB 한도에 걸린다. Oracle과 Azure를 둘 다 쓸 수 없을 때만 쓴다.
- **D안**: Azure for Students. 사용자가 정규 대학생이면 카드 없이 $100/년으로 Korea Central VM(B2ats v2 등 750시간)이나 Container Apps 1대 상시를 감당할 수 있다. 매년 갱신해야 한다.

---

## 5. 이전 절차 (A안 기준, 순서대로)

저장소 변경(별도 PR) 세 가지가 먼저 필요하다.
- (a) `StorageService`에 `S3_ENDPOINT`를 추가한다. 있으면 `endpoint`로 넘기고, R2면 `S3_REGION=auto`.
- (b) Dockerfile 기반 이미지를 `node:22-bookworm-slim` 또는 `node:24`로 올린다. bcrypt 6은 N-API라 문제없을 것으로 본다 [추정]. 테스트로 확인한다.
- (c) `.github/workflows/deploy-api.yml`을 추가한다.

이 조사는 저장소를 바꾸지 않았다.

### 5-1. 준비(결정·계정)

1. Atlas 콘솔 → Database → 지금 쓰는 클러스터에서 **티어와 리전**을 확인한다. M0이 아니면 요금이 나가는지도 본다.
2. Atlas 「Create cluster → Free」에서 서울(AWS·GCP·Azure) 중 고를 수 있는 리전을 본다. 없으면 도쿄를 쓴다.
3. 도메인을 정한다(8장 질문). DNS는 Cloudflare 무료 DNS를 써도 된다. 단 API 레코드는 **프록시를 끈다**.
4. Oracle Cloud Free Tier에 가입한다. **홈 리전은 나중에 바꿀 수 없다.** Always Free 컴퓨팅은 홈 리전에서만 만들 수 있다 [검색 요약]. 서울과 춘천 중 하나를 고른다.

### 5-2. 프로비저닝(Oracle VM)

1. 콘솔에서 VCN 마법사(공용 서브넷)를 만든다. 보안 목록 수신 규칙은 TCP 22(내 IP만), 80, 443이다.
2. 인스턴스를 만든다: Ubuntu 24.04, `VM.Standard.E2.1.Micro`(또는 `VM.Standard.A1.Flex` 1~2 OCPU/6~12 GB), SSH 공개 키 등록.
   - 「Out of host capacity」가 나면 시간을 바꿔 다시 시도한다 [검색 요약].
3. VM 초기 설정:

```bash
ssh ubuntu@<VM_IP>
sudo apt-get update && sudo apt-get -y upgrade && sudo apt-get -y install unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu && newgrp docker
# 1 GB RAM이면 스왑 2 GB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# OCI Ubuntu 이미지는 iptables가 80/443을 막아 둔다 [추정: 널리 알려진 동작, 확인 필요]
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo mkdir -p /opt/stride/tiles && sudo chown -R ubuntu: /opt/stride
```

4. Atlas Network Access에 VM 공인 IP를 추가한다.

### 5-3. 비밀값

1. 로컬 PC에서 기존 값을 읽는다. **화면·로그에 남기지 않도록 파일로 바로 보낸다.**

```bash
aws ssm get-parameters-by-path --region ap-southeast-2 --path /stride --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text \
  | awk '{sub("/stride/","",$1); print $1"="$2}' > stride.env && chmod 600 stride.env
printf 'NODE_ENV=production\nPORT=3000\nS3_REGION=ap-southeast-2\n' >> stride.env
scp stride.env ubuntu@<VM_IP>:/opt/stride/.env && shred -u stride.env
ssh ubuntu@<VM_IP> 'chmod 600 /opt/stride/.env'
```

2. 병행 운영 동안에는 **JWT_SECRET과 JWT_REFRESH_SECRET을 그대로 쓴다.** 그래야 두 서버가 서로의 토큰을 받아 준다. 교체하면 모든 사용자가 로그아웃된다.
3. 사진은 처음엔 기존 S3를 쓴다. R2 전환은 5-7.
4. GitHub 저장소 Settings → Secrets에는 `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`(배포 전용 키)만 넣는다.

### 5-4. Docker 실행(compose)

`/opt/stride/compose.yml`:

```yaml
services:
  api:
    image: ghcr.io/baggy102/stride-api:${TAG:-latest}
    env_file: .env
    restart: unless-stopped
    mem_limit: 600m
    expose: ["3000"]
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./tiles:/srv/tiles:ro
      - caddy_data:/data
volumes:
  caddy_data:
```

배포 워크플로(c)의 핵심:

```yaml
on: { workflow_dispatch: {} }          # 지금처럼 수동 시작
permissions: { contents: read, packages: write }
jobs:
  deploy:
    runs-on: ubuntu-24.04               # A1이면 ubuntu-24.04-arm
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" }
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/server/Dockerfile
          push: true
          tags: ghcr.io/baggy102/stride-api:${{ github.sha }},ghcr.io/baggy102/stride-api:latest
      - name: ssh deploy
        run: |
          install -m 600 /dev/null key && echo "${{ secrets.DEPLOY_SSH_KEY }}" > key
          ssh -i key -o StrictHostKeyChecking=accept-new ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} \
            "cd /opt/stride && TAG=${{ github.sha }} docker compose pull api && TAG=${{ github.sha }} docker compose up -d api"
          curl -fsS --retry 10 --retry-delay 3 https://api.<도메인>/api > /dev/null
```

- 이전 버전으로 되돌리기: VM에서 `TAG=<이전 sha> docker compose up -d api`.

### 5-5. HTTPS(Caddy)

`/opt/stride/Caddyfile`:

```
api.<도메인> {
	encode gzip
	reverse_proxy api:3000
}
tiles.<도메인> {
	@preflight method OPTIONS
	header {
		Access-Control-Allow-Origin *
		Access-Control-Allow-Methods "GET, HEAD, OPTIONS"
		Access-Control-Allow-Headers "range, if-match"
		Access-Control-Expose-Headers "ETag, Content-Range, Content-Length, Accept-Ranges"
		Access-Control-Max-Age 86400
		Cache-Control "public, max-age=31536000, immutable"
	}
	respond @preflight 204
	root * /srv/tiles
	file_server
}
```

- 타일에는 `encode`를 쓰지 않는다. 타일은 이미 압축돼 있고 범위 응답과 섞으면 안 된다(FOLLOWUP B-5).
- 실행: `docker compose up -d`. 인증서는 DNS가 VM을 가리킨 뒤 자동으로 발급된다.

### 5-6. DNS·주소

1. DNS에 `api`와 `tiles`의 A 레코드를 VM IP로 만든다(TTL 300, 프록시 끔).
2. 확인:

```bash
curl -sS -o /dev/null -w '%{http_code} %{time_connect} %{time_starttransfer}\n' https://api.<도메인>/api
curl -sSI -H 'Range: bytes=0-16383' https://tiles.<도메인>/korea-YYYYMMDD.pmtiles   # 206, ETag, CORS
```

3. 서울에서 FOLLOWUP B-8 측정을 돌려 지금(시드니)과 비교한다.

### 5-7. DB 이전(리전이 바뀔 때만)

- 지금 클러스터가 이미 한국 리전 M0이면 건너뛴다.
- M0 리전을 그대로 바꾸는 방법과, M0 대상 라이브 마이그레이션은 확인하지 못했다. 데이터가 작으므로 **dump/restore**로 옮긴다. 프로젝트당 M0이 1개라 **새 프로젝트**에 만든다 [검색 요약].

```bash
# 0) 새 프로젝트에 M0(서울 또는 도쿄)를 만들고, DB 사용자와 Network Access(VM IP, 작업 PC IP)를 설정한다
# 1) 점검 공지 후 쓰기 정지(수 분). 두 서버를 잠깐 내리거나 점검 응답을 낸다
mongodump   --uri "$OLD_URI" --archive=stride.archive --gzip
mongorestore --uri "$NEW_URI" --archive=stride.archive --gzip   # 인덱스(2dsphere 포함)도 복원된다
# 2) 건수 확인
mongosh "$NEW_URI" --eval 'db.getCollectionNames().forEach(c=>print(c, db[c].countDocuments()))'
# 3) 두 서버의 MONGODB_URI를 함께 바꾼다
#    - 새 VM: /opt/stride/.env 수정 → docker compose up -d api
#    - Lightsail: SSM /stride/MONGODB_URI 수정 → CodeBuild stride-api 재실행
# 4) 이전 클러스터는 2주 보관 → 삭제(삭제 전 dump를 암호화해 R2에 보관)
```

- `stride.archive`는 위치 데이터다. 작업 뒤 `shred -u`로 지운다.

### 5-8. 사진 S3 → R2

1. Cloudflare 대시보드에서 R2 버킷 `stride-photos`를 만든다. 위치 힌트는 APAC로 한다. 이 버킷에만 권한이 있는 API 토큰(Object Read & Write)을 만든다.
2. 1차 복사(병행 운영 중 아무 때나):

```bash
rclone config create aws s3 provider AWS access_key_id <S3_ACCESS_KEY_ID> secret_access_key <S3_SECRET> region ap-southeast-2
rclone config create r2  s3 provider Cloudflare access_key_id <R2_KEY> secret_access_key <R2_SECRET> \
  endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com no_check_bucket true
rclone copy aws:<S3_BUCKET> r2:stride-photos --progress
rclone check aws:<S3_BUCKET> r2:stride-photos --one-way
```

3. 전환: PR (a)가 배포된 뒤 새 VM `.env`를 바꾼다.
   - `S3_BUCKET=stride-photos`
   - `S3_REGION=auto`
   - `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - R2 키 2개
   - 바꾼 뒤 `docker compose up -d api`
4. 바로 한 번 더 복사한다: `rclone copy aws:<S3_BUCKET> r2:stride-photos`.
   - 그 사이 Lightsail이 S3에 올린 사진을 가져온다.
   - 파일 이름이 `시각-난수`라 겹치지 않는다 [코드].
5. 확인할 것: 업로드, `GET /uploads/<이름>`의 302 → R2 서명 URL → 200, 계정 삭제 때 `DeleteObjects`.
6. 사진 전환은 **5-9(앱 주소 전환) 뒤**에 한다.
   - 그때까지 두 서버 모두 S3를 쓰므로 사진이 한곳에 모인다.
   - 전환 뒤에도 아직 Lightsail로 오는 옛 앱의 업로드는 S3에만 남는다. 그래서 **Lightsail을 끄기 직전에 `rclone copy`를 한 번 더** 한다.

### 5-9. 앱 API 주소 전환(병행 운영)

1. preview 채널에서 먼저 확인한다: `cd apps/mobile && EXPO_PUBLIC_API_URL=https://api.<도메인> npx eas-cli update --channel preview --message "새 API"`.
   - 로그인, 지도, 업로드, 응원을 실기기에서 확인한다.
2. `apps/mobile/eas.json`의 `build.production.env.EXPO_PUBLIC_API_URL`을 `https://api.<도메인>`으로 바꾼다(PR).
3. 운영 OTA: `node apps/mobile/scripts/eas-update-production.js "API 서버 이전"`.
   - 스크립트가 eas.json 값을 쓴다 [코드].
   - OTA는 받은 다음 실행에 적용되므로, 사용자가 앱을 두 번 열어야 바뀐다[추정].
4. 새 스토어 빌드도 낸다: `eas build -p ios --profile production` → `eas submit -p ios --profile production`.
   - 새로 설치하는 사람의 기본값이 새 주소가 된다.
5. **Lightsail은 그대로 켜 둔다.** 같은 DB, 같은 JWT 비밀값을 쓰므로 어느 서버로 오든 결과가 같다.

### 5-10. 운영 전환 판단과 백업 켜기

- 전환 완료 기준(모두 충족)
  - 새 서버가 7일 동안 UptimeRobot 100%다.
  - 5xx가 없다.
  - Lightsail 요청이 거의 0이다(CloudWatch·Lightsail 지표).
  - EAS 업데이트 채택률이 95% 이상이다.
- 백업 타이머(VM). `age` 공개 키로 암호화하고, 개인 키는 비밀번호 관리자에 둔다.

```bash
# 준비: sudo apt-get -y install age rclone && rclone config (r2 원격, 5-8과 같은 방식)
# /opt/stride/backup.sh
set -euo pipefail
# .env를 source하지 않는다: 연결 문자열의 '&'를 셸이 해석한다
MONGODB_URI=$(grep '^MONGODB_URI=' /opt/stride/.env | cut -d= -f2-)
AGE_PUB=$(cat /opt/stride/backup.pub)          # age 공개 키(개인 키는 비밀번호 관리자)
F=/tmp/stride-$(date +%F).archive.gz.age
docker run --rm mongo:8 mongodump --uri "$MONGODB_URI" --archive --gzip | age -r "$AGE_PUB" > "$F"
rclone copy "$F" r2:stride-backups/ && rm -f "$F"
rclone delete r2:stride-backups --min-age 14d
# systemd 타이머(OnCalendar=*-*-* 04:00 Asia/Seoul)로 매일 실행
```

### 5-11. 되돌리기

| 시점 | 방법 | 소요 |
|---|---|---|
| Lightsail이 살아 있을 때 | 이전 OTA 그룹을 다시 게시한다(`eas update:republish --group <이전 그룹 ID>`). 또는 eas.json을 되돌리고 스크립트를 다시 돌린다 | 수 분 |
| DB 이전 뒤 문제 | 두 서버의 `MONGODB_URI`를 이전 클러스터로 되돌린다(이전 클러스터를 2주 보관하는 이유). 그 사이 새 데이터는 dump로 옮긴다 | 수십 분 |
| 사진 R2 문제 | `.env`를 S3 값으로 되돌린다(S3를 지우기 전까지) | 수 분 |
| Oracle VM이 죽거나 계정이 정지됨 | **B안**: `api` CNAME을 Azure로 바꾸고 인증서를 붙인다. 급하면 Azure 기본 주소로 OTA. 타일은 R2 사본 URL로 OTA | 30분~1시간 |

B안 준비 명령(평소 0대, $0):

```bash
az group create -n stride-rg -l koreacentral
az containerapp env create -n stride-env -g stride-rg -l koreacentral --logs-destination none
az containerapp create -n stride-api -g stride-rg --environment stride-env \
  --image ghcr.io/baggy102/stride-api:latest --target-port 3000 --ingress external \
  --cpu 0.25 --memory 0.5Gi --min-replicas 0 --max-replicas 1 \
  --secrets mongodb-uri="$MONGODB_URI" jwt="$JWT_SECRET" jwt-refresh="$JWT_REFRESH_SECRET" r2-id="$R2_KEY" r2-secret="$R2_SECRET" \
  --env-vars NODE_ENV=production PORT=3000 MONGODB_URI=secretref:mongodb-uri JWT_SECRET=secretref:jwt \
    JWT_REFRESH_SECRET=secretref:jwt-refresh S3_BUCKET=stride-photos S3_REGION=auto \
    S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com S3_ACCESS_KEY_ID=secretref:r2-id S3_SECRET_ACCESS_KEY=secretref:r2-secret
az containerapp show -n stride-api -g stride-rg --query properties.configuration.ingress.fqdn -o tsv
# 장애 때: DNS api CNAME → 위 FQDN (+ asuid TXT), 그다음
az containerapp hostname add  -n stride-api -g stride-rg --hostname api.<도메인>
az containerapp hostname bind -n stride-api -g stride-rg --hostname api.<도메인> --environment stride-env --validation-method CNAME
az containerapp update -n stride-api -g stride-rg --min-replicas 1   # 장애 기간만 상시(유료)
```

- 비밀값 값은 셸 기록에 남지 않게 환경 변수나 파일에서 읽는다.
- Atlas Network Access: Container Apps의 송신 IP는 고정이 아니다. B안을 쓰는 동안에는 `0.0.0.0/0`이 필요할 수 있다. 비밀번호와 TLS로 보호한다[추정].
- 분기에 한 번 B안 전환 연습을 한다(30분).

### 5-12. AWS 정리(2027-03-31까지, 사용자 확인 뒤)

정리 전에 확인할 것:
- R2 사진 건수가 S3와 같다.
- 최종 DB dump가 R2에 있다.
- Lightsail 요청이 2주 동안 0이다.

```bash
R=ap-southeast-2
aws lightsail delete-container-service --region $R --service-name stride-api
aws codebuild delete-project --region $R --name stride-api
aws ssm delete-parameters --region $R --names /stride/MONGODB_URI /stride/JWT_SECRET /stride/JWT_REFRESH_SECRET \
  /stride/S3_BUCKET /stride/S3_ACCESS_KEY_ID /stride/S3_SECRET_ACCESS_KEY
aws s3 rb s3://<S3_BUCKET> --force             # R2 대조 뒤
aws iam list-access-keys --user-name <S3용 IAM 사용자>   # → delete-access-key, delete-user
aws logs describe-log-groups --region $R --log-group-name-prefix /aws/codebuild/stride-api   # → delete-log-group
# CodeBuild 서비스 역할, 남은 자원: Billing 콘솔 「Bills」와 Resource Explorer(모든 리전)로 확인
```

- 그다음 둘 중 하나를 고른다(8장 질문).
  - 계정을 그대로 두어 2027-04-18에 만료되게 한다. 90일 뒤 영구 삭제된다.
  - 직접 해지한다.
- 남은 크레딧은 어느 쪽이든 사라진다.

---

## 6. 위험 목록

| # | 위험 | 가능성·영향 | 완화 |
|---|---|---|---|
| 1 | **Oracle 유휴 회수**: 7일 동안 CPU 95백분위 < 20% 등이면 멈춘다 [검색 요약]. 테스터 규모 API는 거의 항상 이 조건에 든다 | 높음·높음 | PAYG 업그레이드(회수 제외 여부는 **공식 확인 필요**). UptimeRobot 알림. 30분 재구축 절차. B안 대기. 가짜 부하로 피하는 방법은 약관 위험이 있어 권하지 않는다 |
| 2 | **Oracle 계정 정지·해지**(예고 없음, 사유 없음 사례가 포럼에 여럿) [검색 요약] | 중·매우 높음 | VM에 고유 데이터를 두지 않는다(DB는 Atlas, 파일·백업은 R2). B안을 DNS 한 줄로 전환한다. 다른 클라우드에 백업한다 |
| 3 | **Oracle 용량·정책 변경**: 한국 A1 「Out of host capacity」, 춘천 A1 한도 0 보고, 2026-06 A1 반감 [검색 요약] | 중·중 | x86 `E2.1.Micro`를 1순위로 한다(이미지 그대로). A1은 생기면 쓴다. 정책 공지를 분기마다 확인한다 |
| 4 | **Atlas M0 한도**: 512 MB, 초당 100 작업, 송신 10 GB/7일(넘으면 속도 제한) [검색 요약]. 지도 피드 하루 약 2,200회에서 막힌다[추정] | 중(DAU 증가 시)·중 | FOLLOWUP Part A(읽는 양 줄이기)를 먼저 한다. Atlas 지표를 매주 본다. 넘으면 Flex 등급 |
| 5 | **M0 한국 리전 없음** | 중·중 | GCP 서울(2021 Free 추가 기록)을 확인하고, 없으면 도쿄(왕복 30~40 ms가 질의마다 붙는다) |
| 6 | **M0 백업 없음**(미리보기) | 높음·높음 | 매일 암호화 dump → R2(14일). 분기마다 복원 연습 |
| 7 | **AWS 마감 놓침** → 계정 정지 → 90일 뒤 S3 사진 포함 영구 삭제 [공식 문서] | 낮음·높음 | 내부 마감을 2027-03-31로 둔다. 사진 복사를 먼저 한다. 크레딧 잔액을 매달 본다(바닥나도 만료) |
| 8 | **옛 앱이 Lightsail 주소를 계속 씀** → Lightsail을 지우면 그 사용자는 접속하지 못한다 | 중·중 | OTA 채택률 95% 이상 + 새 TestFlight 빌드. Lightsail은 전환 뒤 4주 이상 유지. 이번이 마지막 주소 변경이 되도록 도메인을 도입한다 |
| 9 | **Cloudflare Free 한국 라우팅**: 도쿄·홍콩·미국 서부로 갈 수 있다 [검색 요약]. 512 MB 넘는 파일은 캐시되지 않는다 [검색 요약] | 중·중(타일) | API는 프록시를 끄고 직접 연결한다. 타일은 VM 서빙(T1)을 기본으로, R2는 사본. `cdn-cgi/trace`로 측정한다 |
| 10 | **R2 과금 상한 없음**, 결제 수단 필요 여부 미확인 | 낮음·낮음 | Cloudflare 결제 알림. 사진 버킷은 비공개(서명 URL만) |
| 11 | **콜드 스타트 > 앱 제한 시간 10초**(B안 0대, Render 등) [코드] | B안 사용 시 높음 | 장애 기간에는 `min-replicas 1`(유료). 앱 재시도가 있는지 따로 확인한다 |
| 12 | **Node 20 지원 종료**(2026-04-30) [검색 요약] | 이미 발생·중 | 이전과 함께 `node:22`/`24`로 올린다(PR b). 테스트 통과 후 배포 |
| 13 | **개인정보 처리 위탁·국외 이전 고지 변경**: `docs/legal/privacy-policy.md` 4장이 「AWS」「MongoDB Atlas」「리전 확인 필요」로 비어 있다 [코드]. 사업자(Oracle·Cloudflare·Azure)와 리전이 바뀐다 | 확실·중 | 전환 전에 표를 고친다. 위치정보가 들어 있으므로 국내 리전 여부를 적는다. **법적 판단은 확정하지 않고 자문을 받는다**(korealbs.or.kr 위치정보 맞춤형 컨설팅, k-startup.go.kr 법률지원) |
| 14 | **단일 VM, 직접 운영**: OS 보안 업데이트와 디스크 가득 참 | 중·중 | `unattended-upgrades`, Docker 로그 크기 제한(`max-size`), 디스크 알림 |
| 15 | **GitHub 예약 워크플로 60일 비활성 자동 꺼짐** [검색 요약] | 중·중 | 정기 작업은 VM의 systemd 타이머로 돌린다 |

---

## 7. 일정 (기준: AWS Free 플랜 만료 2027-04-18)

| 기간 | 할 일 | 산출 |
|---|---|---|
| 2026-11-25 ~ 12-05 | 8장 결정. Atlas 티어·리전 확인. 도메인. Oracle 가입(홈 리전) | 결정 기록 |
| 12-06 ~ 12-19 | VM, Docker, Caddy, R2 버킷. PR (a)(b)(c). GHCR 배포 시험. `api.<도메인>`이 기존 DB·S3로 응답 | 새 서버 가동(사용자 없음) |
| 12-20 ~ 2027-01-09 | (필요하면) DB 이전(점검 수 분). preview 채널 OTA로 내부 검증. 서울 측정(B-8) | 측정 결과, DB 한국 리전 |
| 01-10 ~ 01-16 | 운영 OTA + 새 TestFlight 빌드(새 주소). 개인정보 처리방침 4장 갱신 | 사용자 전환 시작 |
| 01-17 ~ 02-13 | 병행 운영 4주. 채택률·오류 확인. 사진 R2 전환 + 마지막 rclone. 백업 타이머 가동 | 전환 완료 기준 충족 |
| 02-14 ~ 02-28 | B안(Azure) 0대 배포, 전환 연습 1회. 타일 PMTiles 전환(FOLLOWUP B-7과 함께) | 예비 경로 검증 |
| 03-01 ~ 03-15 | 최종 dump·사진 대조 → Lightsail·CodeBuild·SSM·S3·IAM 키 삭제 | AWS 자원 0 |
| **03-31** | **내부 마감**: AWS 청구 0 확인. 계정 해지 또는 만료 대기 결정 | — |
| 04-18 | AWS Free 플랜 만료 → 정지(90일 보관 뒤 삭제, 약 2027-07-17) [공식 문서] | — |

- 여유: 2주(03-31 ~ 04-18).
- 가장 오래 걸리는 것은 「옛 앱 채택률」이므로 OTA를 1월 중순 전에 낸다.

---

## 8. 사용자가 정할 것

1. **무료와 안정성 중 무엇을 우선할까요?**
   - (A) 완전 $0, Oracle(회수·정지 위험 감수, Azure 예비)
   - (B) Azure Container Apps 1대 상시, 월 약 $4~14[추정]
   - (C) Azure 0대 운영, $0이지만 콜드 스타트로 첫 요청이 10초를 넘을 수 있음
2. **카드 등록**: Oracle PAYG 업그레이드와 Azure PAYG 구독에 카드를 등록해도 될까요? 둘 다 한도 안이면 $0이고 예산 알림을 겁니다.
3. **도메인**: 도메인을 살까요(연 $10~15, 앞으로 서버를 옮길 때 앱 업데이트가 필요 없어짐)? 아니면 무료 하위 도메인(DuckDNS)을 쓸까요? 이미 가진 도메인이 있나요?
4. **Atlas 현황**: 지금 클러스터의 티어와 리전을 알려 주세요(Atlas 콘솔 → Database). M0이 아니라면 요금이 나가고 있나요?
5. **Oracle 계정**: 이미 있나요? 있다면 홈 리전은 어디인가요(바꿀 수 없음)?
6. **학생 여부**: 정규 대학생이면 Azure for Students(카드 없이 연 $100)를 쓸 수 있습니다.
7. **지도 타일**: 이번 이전에 PMTiles 자체 호스팅(FOLLOWUP Part B)을 같이 할까요, 따로 할까요? Protomaps 호스팅 API의 상업 이용 문제는 남아 있습니다.
8. **점검 시간**: DB 이전(필요할 때)에 쓰기를 몇 분 멈춰도 될까요? 새 TestFlight 빌드는 언제 낼까요?
9. **AWS 계정 마무리**: 정리 뒤 직접 해지할까요, 만료(2027-04-18)되게 둘까요?
10. **개인정보 처리방침**: 처리 위탁·국외 이전 표 갱신과 자문은 누가 맡을까요?
11. **Node 버전**: 이전과 함께 Node 22(2027-04 종료)와 Node 24(2028-04 종료) 중 어느 쪽으로 올릴까요?

---

## 부록: 출처 목록

- [공식 문서] AWS: https://aws.amazon.com/free/terms/ , https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html , https://aws.amazon.com/free/free-tier-faqs/ , https://docs.aws.amazon.com/accounts/latest/reference/upgrade-account.html
- [검색 요약] 2026-11-24 검색. 날짜가 바뀔 수 있으니 결정 전에 다시 연다.
  - Oracle: https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm , https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/ , https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/ , https://community.oracle.com/customerconnect/discussion/964620 , https://community.oracle.com/customerconnect/discussion/974451
  - Azure: https://azure.microsoft.com/pricing/details/container-apps/ , https://learn.microsoft.com/azure/container-apps/billing , https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates , https://learn.microsoft.com/azure/container-apps/log-options , https://learn.microsoft.com/azure/container-apps/manage-secrets , https://azure.microsoft.com/pricing/details/functions/ , https://azure.microsoft.com/pricing/free-services/ , https://azure.microsoft.com/free/free-account-faq , https://azure.microsoft.com/pricing/details/bandwidth/ , https://learn.microsoft.com/azure/cosmos-db/free-tier , https://learn.microsoft.com/azure/cosmos-db/mongodb/indexing , https://learn.microsoft.com/azure/documentdb/free-tier , https://learn.microsoft.com/en-us/azure/education-hub/about-azure-for-students
  - MongoDB: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/ , https://www.mongodb.com/docs/atlas/reference/amazon-aws/ , https://www.mongodb.com/docs/atlas/reference/microsoft-azure/ , https://www.mongodb.com/docs/atlas/release-notes/changelog/ , https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/
  - Google: https://cloud.google.com/free/docs/compute-getting-started , https://cloud.google.com/run/pricing
  - Cloudflare: https://developers.cloudflare.com/r2/pricing , https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/ , https://developers.cloudflare.com/workers/platform/limits , https://developers.cloudflare.com/cache/concepts/default-cache-behavior/ , https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ , https://docs.protomaps.com/deploy/cloudflare , https://blog.cloudflare.com/bandwidth-costs-around-the-world/
  - PaaS: https://render.com/docs/free , https://www.koyeb.com/docs/faqs/pricing , https://northflank.com/pricing , https://zeabur.com/docs/pricing/free-plan
  - GitHub: https://docs.github.com/en/actions/reference/runners/github-hosted-runners , https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow
  - 기타: https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan , Node 20 EOL(여러 출처, nodejs.org 일정과 같은 날짜)
- [코드] `apps/server/{Dockerfile,buildspec.yml,src/main.ts,src/storage/storage.service.ts,src/runs/*}`, `apps/mobile/{eas.json,app.json,app.config.js,scripts/eas-update-production.js,src/api/client.ts}`, `docs/legal/privacy-policy.md`, `node_modules/bcrypt/prebuilds/`
