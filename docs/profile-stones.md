# 프로필 사진 돌 (ZESTMOK)

OhOhMok(builtkwon/OhOhMok)의 사진 돌을 ZESTMOK에 이식한 것. **기본 돌은 바뀌지 않는다.**

## 기본 돌 규칙 (필수)

- 기본 돌은 ZEST 사진 `img/stone-black.jpg`, `img/stone-white.jpg`. 삭제·교체·재색칠·잘라내기 금지.
- 보스(원준) 사진 규칙(`body.boss-*`, rage, win)과 `!important`는 그대로. 변수보다 우선한다.
- 사진을 정한 사용자의 돌만 덮어쓴다. 사진 지우기, 로그아웃, 남의 사진 숨기기면 ZEST 사진으로 돌아간다.
- 구현: `background-image: var(--stone-black-img, url(img/stone-black.jpg))`. 변수를 지우면(`Profile.setStone(color, null)`) 폴백인 ZEST 사진이 보인다.
- `tests/ui.e2e.mjs`가 사진이 없을 때 판·패널·돌 선택·결과 돌이 `stone-black.jpg`/`stone-white.jpg`를 쓰는지 검사한다.

## 사진 출처 / 저장

1. 올린 사진(128px 정사각 JPEG, ≤ 44,000자) 2. Google 프로필 사진 3. 없음 → ZEST 돌.
누끼(MediaPipe selfie segmenter)는 사진을 정할 때만 지연 로드, 예산 3초, 늦게 끝나면 저장 후 갱신.
localStorage 키는 `zestmok-profile`, `zestmok-hide-avatars`(같은 github.io 출처의 OhOhMok과 섞이지 않게 `ohohmok-`와 분리).

## 어디에 누구 사진이 붙나

- AI 대전: 내 색에만 내 사진. AI 쪽은 ZEST 사진(보스면 원준 사진).
- 방: 팀 대표(팀 첫 플레이어) 사진. 대표가 사진이 없거나 숨기면 ZEST 사진.

## 방 프로토콜: `avatar`

- guest → host `{type:'avatar', src}` (입장 직후, 사진이 바뀔 때). host는 `TeamLogic.validAvatar`로 검증해 `TM.av[id]`에 저장하고 모두에게 `{type:'avatar', id, src}` 중계(id당 1초에 1번, 창 끝에 최신 값). 새로 들어온 guest에게는 아는 사진을 전부 보낸다(snap에는 넣지 않음).
- 받는 쪽도 다시 검증. 통과 못 하면 버림. 문자 집합이 `url("...")`에 안전하다.
- 방장 "사진 끄기": `{type:'avatar', id, src:null}` 후 그 id의 이후 `avatar` 무시(`avatarOff`, 방이 끝날 때까지).
- "다른 사람 사진 숨기기": 받는 쪽 설정. 내 사진은 항상 보인다.

## CSP / 외부 요청

GIS(`accounts.google.com/gsi/*`)·`lh3.googleusercontent.com`·`wasm-unsafe-eval`만 추가. MediaPipe 사용 기록(`odml.pa.googleapis.com`)은 `connect-src`에 **절대 추가하지 않는다**. 페이지 로드 때 외부 요청 0(GIS는 프로필 메뉴를 처음 열 때, MediaPipe는 사진을 정할 때만 로드).

## Google OAuth 클라이언트 ID

`923238134204-skkpl84vtimf60a8s1sl00562tqlr7b9.apps.googleusercontent.com`(OhOhMok과 같은 출처 `builtkwon.github.io`). `profile.js`에 있다. 공개 값.
