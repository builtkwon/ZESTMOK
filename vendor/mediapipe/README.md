# vendor/mediapipe

사진 돌 누끼(배경 제거)용. `profile.js`가 사진을 정할 때만 지연 로드한다(페이지 로드 때 요청 0). 손으로 넣은 파일이며 고치지 않는다.

| 파일 | 출처 | 버전 | SHA-256 |
| --- | --- | --- | --- |
| `vision_bundle.js` | npm `@mediapipe/tasks-vision` `vision_bundle.js`(IIFE, 전역 `Vision`) | 1.2.2 (2026-11-03 게시) | `a8c95ebecb9efca4ef79ce32f7b77fa5cb61b809e7e21a2f3d792d181ca0b822` |
| `vision_wasm_internal.js` | 같은 패키지 `wasm/vision_wasm_internal.js` | 1.2.2 | `f2b9c17131ea79716ec6bf07b117a087b2749a6f8a1e2f1f2e77a9382092db5b` |
| `vision_wasm_internal.wasm` | 같은 패키지 `wasm/vision_wasm_internal.wasm` | 1.2.2 | `f5bd25147ac89d506074293ce2675969b10e827180db95a0d9689c2ed80764ab` |
| `selfie_segmenter.tflite` | https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite | float16 / 1 (2023-05-07) | `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b` |
| `LICENSE` | https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE | - | `8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8` |

- 패키지 tarball: https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.2.2.tgz (SHA-256 `f45cdb573e76cbd3f289a28d63f5601c632e68d256a3e5b4d82141b013f36b62`).
- 라이선스: 둘 다 Apache-2.0(`LICENSE`).
- 뺀 것: ESM/CJS 번들, `.map`, `.d.ts`, `vision_wasm_module_internal.*`(`FilesetResolver.forVisionTasks(path)` 기본값은 `vision_wasm_internal.*`만 쓴다).
- 1.2.2를 고른 이유: 작업일(2026-11-24) 기준 2주 넘게 지난 최신 정식 버전(1.2.3은 2026-11-11 게시).
- 올릴 때: tarball에서 위 세 파일을 같은 이름으로 바꾸고 이 표의 버전·SHA-256을 고친다.
- 원격 기록: 번들이 약 60초마다 `https://odml.pa.googleapis.com/v1/log`로 사용 기록을 POST한다(끄는 옵션 없음). `index.html` CSP의 `connect-src`가 막는 것이 의도이며, 이 주소를 허용하지 않는다.
