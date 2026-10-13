# Excel Ribbon Builder

엑셀 파일의 사용자 지정 리본(customUI)을 브라우저에서 설계하는 웹앱입니다.
서버 없이 동작하며, 파일은 외부로 전송되지 않습니다.

바로 쓰기: https://iksangyoo-sys.github.io/RibBuilder/ (main에 올리면 GitHub Actions가 자동으로 빌드해 올립니다.)

## 실행

```bash
npm install
npm run dev
```

단일 HTML로 묶으려면:

```bash
npm run build
```

`dist/index.html`을 `ribbon-editor.html`로 복사해 더블클릭하면 됩니다.

테스트:

```bash
npm test
```

## 구조

- `src/model` — 리본 데이터, id, 복제, 검증
- `src/xml` — customUI 생성·파싱·병합
- `src/vba` — 콜백 코드 생성
- `src/ooxml` — xlsx/xlsm zip 읽기·쓰기
- `src/ovba` — vbaProject.bin 읽기·만들기 (MS-OVBA 압축, dir/PROJECT 스트림)
- `src/store` — Zustand + 실행 취소 + localStorage 자동 저장
- `src/components` — 화면

## 알려진 제한

- [VBA 포함]이 켜져 있고 연결된 콜백이 있으면 `vbaProject.bin`을 새로 만들어 `.xlsm`으로 저장합니다. 이미 VBA가 있는 파일은 기존 코드를 지키기 위해 코드 복사 방식만 지원합니다.
- 기존 파일의 VBA에 모듈을 추가하는 2단계는 지원하지 않습니다.
- 갤러리·동적 메뉴 등 확장 컨트롤은 가져올 때 “알 수 없는 요소”로 원문을 보존합니다.
- 아이콘 미리보기 이미지가 없으면 imageMso 이름만 표시합니다.
