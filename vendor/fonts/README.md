# vendor/fonts

화면 전체(판 좌표 포함) 글꼴. `style.css`의 `@font-face`(`font-display: swap`)가 읽는다. 손으로 넣은 파일이며 고치지 않는다. 이름이 동적이라(구글 이름·닉네임) 서브셋하지 않고 한글 전체를 담은 원본을 쓴다.

| 파일 | 출처 | 버전 | SHA-256 |
| --- | --- | --- | --- |
| `Galmuri11.woff2` | npm `galmuri` `dist/Galmuri11.woff2` | 2.40.3 (2025-08-13 게시) | `f467d1b10e6b88dfa8399c9f93b38c7643e050abfe4fc15800ac0b000f5a57d6` |
| `Galmuri11-Bold.woff2` | 같은 패키지 `dist/Galmuri11-Bold.woff2` | 2.40.3 | `8643094f395aa2dbad6bc4385cc043314801eaec2e759d549435ec8ac4f2d078` |
| `LICENSE` | 같은 패키지 `dist/LICENSE.txt` | 2.40.3 | `86a3ee9495f942f0243f18c103da9faca27adb88142613edb8bb852e56c892c1` |

- 패키지 tarball: https://registry.npmjs.org/galmuri/-/galmuri-2.40.3.tgz (SHA-256 `7d6b2b8534d157dd5e4eb8e01145f7388c0383bed8a96f5ec719eaacf1f86816`).
- 라이선스: SIL Open Font License 1.1(`LICENSE`), 저작자 quiple(Lee Minseo). 예약 글꼴 이름 "Galmuri".
- 설계 크기 12px: 글자 크기는 12px·24px·36px(배수)만 쓴다.
- 뺀 것: `.ttf`·`.bdf`, Galmuri14/9/7, Mono, Condensed. Galmuri11 Bold에는 가나·한자가 없다(그 글자는 보통 굵기로 대신 그려진다).
- 2.40.3을 고른 이유: 작업일(2026-11-25) 기준 2주 넘게 지난 최신 버전.
- 올릴 때: tarball에서 위 파일을 같은 이름으로 바꾸고 이 표의 버전·SHA-256을 고친다.
