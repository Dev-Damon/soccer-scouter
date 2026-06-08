# ⚽ 축구 스카우터 (Soccer Scouter)

월드컵 보다가 **"쟤 누구야?"** 싶을 때, 선수·팀을 검색하면 **등급·소속·강점·이력**을 카드 한 장으로 보여주는 웹앱(PWA).

> 상위 기획 문서는 `../plan.md` 참고.

## 현재 상태 — v0.1 (뼈대)
- ✅ PWA 골격: 홈 / 검색 / 선수 카드 / 팀 카드
- ✅ 검색(선수·팀·소속 클럽), 점수 기반 정렬, 모바일 우선 디자인
- ✅ 오프라인 캐시(서비스워커) + 홈화면 설치(manifest)
- ⚠️ 데이터는 **샘플** (손흥민·음바페·메시 등 13명, 5개국). 실데이터는 Day 2 파이프라인으로 교체.

## 실행 방법

### 가장 간단 — 그냥 열기
`index.html`을 더블클릭해 브라우저로 열면 동작합니다. (데이터는 `data.js`로 인라인 → 서버 불필요)
단, 서비스워커(오프라인/설치)는 http(s)에서만 동작합니다.

### 로컬 서버로 (PWA 기능까지 확인)
```bash
cd soccer-scouter
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080
```

### 배포 (무료, 심사 없음)
- **Vercel / Netlify / Cloudflare Pages** 중 아무거나에 이 폴더를 올리면 끝.
- 정적 파일만 있어서 빌드 설정 불필요. 배포 후 링크 공유 → 폰 홈화면에 '추가' 가능.

## 구조
```
soccer-scouter/
├─ index.html      앱 셸
├─ styles.css      디자인(다크, 모바일 우선)
├─ app.js          로직(검색·라우팅·카드 렌더) — 프레임워크 없음
├─ data.js         데이터(window.DATA) ← 파이프라인이 이 파일을 생성/교체
├─ manifest.webmanifest / icon.svg / sw.js   PWA
└─ README.md
```

## 데이터 모델 (`data.js`)
```
player: { id, name, nameEn, team, club, league, position, age, caps,
          intlGoals, grade, gradeScore(0~100), oneLiner,
          strengths[], weaknesses[], honours[], notableTransfer }
team:   { id, name, nameEn, flag, fifaRank, group,
          tierSummary, styleSummary[3], keyPlayerIds[] }
```

### 합법성 원칙 (중요)
- **사실(fact)만 사용:** 소속 클럽·리그, 출전·득점, 대표팀 caps, 우승·수상, 나이, 실제 이적료 → 위키피디아(CC) 기반.
- **타사 추정치 복제 금지:** Transfermarkt '시장가치(몸값)', Sofascore 평점 등.
- `grade`/`gradeScore`는 위 사실 신호를 합성한 **우리만의 지표**(남의 몸값 베끼지 않음 = 합법 + 차별화).

## 다음 단계 (Day 2~3)
- [ ] 위키 기반 데이터 수집 → `data.js` 자동 생성 스크립트
- [ ] 본선 출전국 + 핵심 선수로 데이터 확장
- [ ] 디자인 다듬기 + 배포 + 링크 공유
- [ ] (v2) 용어사전 / 경기 관전포인트 / 팀 비교
