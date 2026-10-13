from pathlib import Path
from playwright.sync_api import sync_playwright

html = Path(__file__).resolve().parent.joinpath("ribbon-editor.html").as_uri()
out = Path(__file__).resolve().parent / "_excel_out"
out.mkdir(exist_ok=True)
results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS" if ok else "FAIL"), name, detail)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(html)
        page.wait_for_selector("text=+ 탭 추가")
        check("바로 편집 화면", page.get_by_role("button", name="파일").count() > 0)
        page.get_by_role("button", name="+ 탭 추가").click()
        page.locator("[data-testid=custom-tab-menu]").first.click()
        check("사용자 탭 추가", page.get_by_text("사용자 탭 1", exact=True).count() > 0)
        page.keyboard.press("Escape")
        page.get_by_role("button", name="그룹 추가").click()
        check("그룹 추가", page.get_by_text("그룹 1").count() > 0)
        check("헤더 버튼", page.get_by_role("button", name="파일").count() > 0)
        check("하단 XML 가져오기", page.get_by_role("button", name="XML 가져오기").count() > 0)
        check("기본 탭 숨김", page.get_by_role("button", name="홈", exact=True).count() == 0)
        check("검색창 없음", page.get_by_placeholder("이름으로 검색").count() == 0)
        check("컨트롤 제목 없음", page.get_by_text("컨트롤", exact=True).count() == 0)
        page.locator("[data-testid=custom-tab-menu]").first.click()
        menu = page.locator("[data-testid=context-menu]")
        check("탭 메뉴", menu.count() > 0)
        menu.locator("[data-action]").nth(1).click()
        check("탭 복제", page.get_by_text("사용자 탭 1 복사", exact=True).count() > 0)
        page.locator("[data-testid=custom-tab-menu]").first.click()
        page.locator("[data-testid=context-menu] [data-action]").first.click()
        rename = page.locator("input.w-28")
        rename.wait_for()
        rename.fill("이름바꿈")
        rename.press("Enter")
        check("탭 이름 변경", page.get_by_text("이름바꿈").count() > 0)
        page.keyboard.press("Control+z")
        check("실행 취소", page.get_by_text("사용자 탭 1", exact=True).count() > 0)
        src = page.locator("text=버튼").first
        dst = page.get_by_text("드래그 추가").first
        src.drag_to(dst)
        check("컨트롤 드롭", page.locator("text=버튼").count() >= 2)
        page.locator("[data-testid=builtin-groups] summary").click()
        check("내장 그룹 팔레트", page.get_by_text("코드 · Visual Basic, 매크로").count() > 0)
        check("XML 미리보기", page.locator("pre").first.inner_text().find("customUI") >= 0)
        check("VBA 패널", page.get_by_text("VBA 코드 (모듈에 붙여넣기)").count() > 0)
        page.get_by_role("button", name="XML 가져오기").click()
        check("XML 가져오기", page.locator("textarea").count() > 0)
        page.get_by_role("button", name="취소", exact=True).click()
        page.get_by_role("button", name="XML 내보내기").click()
        check("XML 내보내기", page.get_by_text("리본 XML").count() > 0)
        page.screenshot(path=str(out / "ui_editor.png"))
        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"{len(results) - len(failed)} passed, {len(failed)} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
