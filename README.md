# Excel Ribbon Builder

엑셀 파일의 사용자 지정 리본(customUI)을 브라우저에서 설계하는 웹앱입니다.
서버 없이 동작하며, 파일은 외부로 전송되지 않습니다.

바로 쓰기: https://iksangyoo-sys.github.io/RibBuilder/ (main에 올리면 GitHub Actions가 자동으로 빌드해 올립니다.)
인터넷 없이 쓰려면 `ribbon-editor.html`을 내려받아 더블클릭하세요.

정비비 대시보드: https://iksangyoo-sys.github.io/RibBuilder/dashboard/ (`dashboard/` 폴더, 자세한 내용은 [dashboard/README.md](dashboard/README.md))

## 사용 흐름

1. 탭·그룹·컨트롤을 배치하고, 컨트롤마다 콜백(VBA) 매크로를 연결합니다.
2. [저장하기]를 누르면 `.xlsm`(매크로 포함)으로 내려받습니다. 콜백이 없으면 `.xlsx`입니다.
3. 받은 파일 속성에서 **차단 해제**를 한 뒤 엑셀에서 엽니다. (인터넷에서 받은 파일은 Windows가 매크로를 막습니다.)
4. Alt+F11 → `RibbonCallbacks` 모듈의 TODO 자리에 실제 코드를 채웁니다.
5. 리본을 고치려면 그 `.xlsm`(또는 `.xlam`)을 다시 불러와 저장합니다. 채운 VBA는 그대로 남고, 새로 연결한 매크로는 자동으로 새 모듈에 들어갑니다.

## 실행

```bash
npm install
npm run dev
```

단일 HTML로 묶으려면:

```bash
npm run build
```

`dist/index.html`을 `ribbon-editor.html`로 복사해 커밋하세요. CI가 둘이 같은지 확인합니다.

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

- [VBA 포함]이 켜져 있고 연결된 콜백이 있으면 `vbaProject.bin`을 새로 만들어 `.xlsm`으로 저장합니다.
- 이미 VBA가 있는 파일(.xlsm·.xlam)은 기존 모듈을 그대로 두고, 파일에 없는 매크로만 새 표준 모듈(`RibbonCallbacks`)로 더합니다. 엑셀은 다음에 열 때 소스로 다시 컴파일합니다. 암호가 걸린 VBA 프로젝트는 건드리지 않습니다.
- 같은 매크로를 서명이 다른 콜백(예: 버튼과 드롭다운)에 함께 연결할 수 없습니다. VBA의 Sub는 서명이 하나뿐이기 때문입니다.
- 갤러리·동적 메뉴 등 확장 컨트롤은 가져올 때 “알 수 없는 요소”로 원문을 보존합니다.
- 아이콘 미리보기 이미지가 없으면 imageMso 이름만 표시합니다.
