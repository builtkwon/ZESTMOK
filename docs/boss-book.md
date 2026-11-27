# 보스 공용 학습 (ai-book)

브라우저마다 따로 쌓이던 보스 학습(`GomokuAI.getMemory()`)을 모든 사이트 방문자가 함께 쓰게 만드는 장치.

## 흐름

1. 보스 대국이 끝나면 `index.html`의 `aiSend`가 기보를 구글 시트(Apps Script 웹 앱)로 보낸다. 응답은 받지 않는다(`mode: 'no-cors'`).
   - 보내는 값: `{s: 'zestmok', ai: 1|2, w: 0|1|2, m: [[row, col], ...]}`. 수순만 있고 개인정보는 없다. 흑부터 번갈아 둔 순서.
   - `w`는 학습(`aiLearn`)에 넘기는 값과 같다. 상 엎기는 사람 승(AI 1패)으로 기록된다.
   - 페이지 하단에 "보스 대국 기보는 AI 학습을 위해 익명으로 수집됩니다"를 배경과 비슷한 색으로 작게 표시한다.
2. 가끔 `tools/build-book.js`로 시트를 받아 `ai-book.js`를 다시 만든다.
   - 수순을 다시 두어 보고 판 밖, 겹친 자리, 흑 금수가 있는 기록은 버린다. 같은 기보는 한 번만 센다.
   - 시드(브라우저에서 뽑은 `getMemory()` 덤프)를 먼저 합치고, 기보를 `GomokuAI.learn`으로 쌓는다. 연승(streak)은 기보마다 0에서 시작한다.
3. `ai-book.js`를 커밋·배포하면, 보스 단계를 고른 브라우저가 처음 한 번 불러와 `GomokuAI.setBook`에 넣는다. 다른 단계는 쓰지 않는다.
   - 책은 브라우저 자기 학습과 함께 읽힐 뿐 거기에 복사되지 않는다(`avoid` = 합집합, `hum` = 횟수 합).

```
BOOK_URL=<웹 앱 URL> BOOK_KEY=<키> node tools/build-book.js "<시드 파일>"
```

첫 `ai-book.js`는 사용자가 브라우저에서 뽑은 `ohohmok.txt`(zestmok 데이터 포함)를 시드로 만들었다. 시드 파일은 저장소 밖에 둔다. 다시 만들 때도 같은 시드를 넘겨야 그 내용이 남는다.

## 시트 만들기 (한 번)

1. 구글 시트를 새로 만든다. 확장 프로그램 → Apps Script.
2. 아래 코드를 붙여 넣고 `KEY`를 아무도 모를 문자열로 바꾼다. 키는 저장소에 적지 않는다.
3. 배포 → 새 배포 → 유형 "웹 앱", 실행 계정 "나", 액세스 "모든 사용자" → 배포. 권한 승인.
4. 웹 앱 URL(`https://script.google.com/macros/s/.../exec`)을 `index.html`의 `BOOK_SEND`에 넣는다. 코드를 고치면 "배포 관리 → 수정 → 새 버전"으로 같은 URL을 유지한다.

```js
const KEY = 'CHANGE-ME';
function doPost(e) {
  const d = (e.postData && e.postData.contents) || '';
  if (d.length > 4000) return ContentService.createTextOutput('too big');
  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([new Date(), d]);
  return ContentService.createTextOutput('ok');
}
function doGet(e) {
  if (e.parameter.key !== KEY) return ContentService.createTextOutput('no');
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getValues();
  return ContentService.createTextOutput(JSON.stringify(rows)).setMimeType(ContentService.MimeType.JSON);
}
```

## 한계

- 누구나 시트에 가짜 기록을 보낼 수 있다. 규칙 검사만 하므로, 정상 수순의 가짜 "사람 승"은 보스가 그 수를 피하게 만든다(피해는 그 국면 한정).
- 정확히 같은 국면에만 듣는다(회전 4방향 포함). 새 수순에는 효과가 없다.
- 학습 저장 한도(키 4000개)를 넘으면 오래된 키부터 빠진다. 시드가 먼저 빠진다.
