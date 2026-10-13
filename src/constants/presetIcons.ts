const files = import.meta.glob("../assets/icons/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const LABELS: Record<string, string> = {
  "icons8-ai-커서-48.png": "AI 커서",
  "icons8-android-os-48.png": "Android",
  "icons8-c++-48.png": "C++",
  "icons8-canva-48.png": "Canva",
  "icons8-chatgpt-48.png": "ChatGPT",
  "icons8-deepseek-48.png": "DeepSeek",
  "icons8-eye-50.png": "눈",
  "icons8-facebook-48.png": "Facebook",
  "icons8-gemini-ai-48.png": "Gemini",
  "icons8-github-copilot-48.png": "GitHub Copilot",
  "icons8-gmail-48.png": "Gmail",
  "icons8-google-48.png": "Google",
  "icons8-google-meet-48.png": "Google Meet",
  "icons8-google-sheets-48.png": "Google Sheets",
  "icons8-google-클라우드-48.png": "Google Cloud",
  "icons8-grok-48.png": "Grok",
  "icons8-instagram-48.png": "Instagram",
  "icons8-linkedin-48.png": "LinkedIn",
  "icons8-mail-48.png": "메일",
  "icons8-microsoft-copilot-48.png": "Microsoft Copilot",
  "icons8-microsoft-office-2019-48.png": "Office",
  "icons8-microsoft-outlook-2025-48.png": "Outlook",
  "icons8-microsoft-powerpoint-2019-48.png": "PowerPoint",
  "icons8-microsoft-word-2019-48.png": "Word",
  "icons8-perplexity-ai-48.png": "Perplexity",
  "icons8-power-bi-2021-48.png": "Power BI",
  "icons8-python-48.png": "Python",
  "icons8-services-48.png": "서비스",
  "icons8-sql-48.png": "SQL",
  "icons8-telegram-app-48.png": "Telegram",
  "icons8-tiktok-48.png": "TikTok",
  "icons8-website-48.png": "웹사이트",
  "icons8-windows-copilot-48.png": "Windows Copilot",
  "icons8-x-48.png": "X",
  "icons8-youtube-48.png": "YouTube",
  "icons8-클로드-아이-48.png": "Claude",
  "icons8-amazon-web-services-48.png": "AWS",
  "icons8-azure-50.png": "Azure",
  "icons8-book-50.png": "책",
  "icons8-camera-50.png": "카메라",
  "icons8-camera-50-2.png": "카메라 2",
  "icons8-company-50.png": "회사",
  "icons8-download-50.png": "다운로드",
  "icons8-folder-48.png": "폴더",
  "icons8-folder-50.png": "폴더 2",
  "icons8-github-50.png": "GitHub",
  "icons8-google-코드-48.png": "Google 코드",
  "icons8-handshake-50.png": "악수",
  "icons8-javascript-48.png": "JavaScript",
  "icons8-light-on-50.png": "아이디어",
  "icons8-magnetic-card-50.png": "카드",
  "icons8-microsoft-365-50.png": "Microsoft 365",
  "icons8-microsoft-teams-50.png": "Teams",
  "icons8-ms-edge-새-50.png": "Edge",
  "icons8-mysql-logo-50.png": "MySQL",
  "icons8-natural-user-interface-50.png": "손가락",
  "icons8-online-support-50.png": "고객지원",
  "icons8-plus-50.png": "추가",
  "icons8-rstudio-48.png": "RStudio",
  "icons8-save-50.png": "저장",
  "icons8-search-50.png": "검색",
  "icons8-shopping-cart-50.png": "장바구니",
  "icons8-sql-50.png": "SQL 2",
  "icons8-standing-man-50.png": "사람",
  "icons8-truck-50.png": "트럭",
  "icons8-twitter-bird-48.png": "Twitter",
  "icons8-user-50.png": "사용자",
  "icons8-user-groups-50.png": "그룹",
  "icons8-visual-basic-48.png": "Visual Basic",
  "icons8-문서-서명-50.png": "문서 서명",
  "icons8-비주얼-스튜디오-코드-2019-48.png": "VS Code",
  "icons8-사과-카메라-50.png": "사진",
  "icons8-우편-50.png": "우편",
  "icons8-이메일-50.png": "이메일",
  "icons8-콘솔-48.png": "콘솔",
  "icons8-프로그램-작성-48.png": "코딩",
};

const IDS: Record<string, string> = {
  "icons8-ai-커서-48.png": "img_ai_cursor",
  "icons8-android-os-48.png": "img_android",
  "icons8-c++-48.png": "img_cpp",
  "icons8-canva-48.png": "img_canva",
  "icons8-chatgpt-48.png": "img_chatgpt",
  "icons8-deepseek-48.png": "img_deepseek",
  "icons8-eye-50.png": "img_eye",
  "icons8-facebook-48.png": "img_facebook",
  "icons8-gemini-ai-48.png": "img_gemini",
  "icons8-github-copilot-48.png": "img_copilot_gh",
  "icons8-gmail-48.png": "img_gmail",
  "icons8-google-48.png": "img_google",
  "icons8-google-meet-48.png": "img_meet",
  "icons8-google-sheets-48.png": "img_sheets",
  "icons8-google-클라우드-48.png": "img_gcloud",
  "icons8-grok-48.png": "img_grok",
  "icons8-instagram-48.png": "img_instagram",
  "icons8-linkedin-48.png": "img_linkedin",
  "icons8-mail-48.png": "img_mail",
  "icons8-microsoft-copilot-48.png": "img_ms_copilot",
  "icons8-microsoft-office-2019-48.png": "img_office",
  "icons8-microsoft-outlook-2025-48.png": "img_outlook",
  "icons8-microsoft-powerpoint-2019-48.png": "img_ppt",
  "icons8-microsoft-word-2019-48.png": "img_word",
  "icons8-perplexity-ai-48.png": "img_perplexity",
  "icons8-power-bi-2021-48.png": "img_powerbi",
  "icons8-python-48.png": "img_python",
  "icons8-services-48.png": "img_services",
  "icons8-sql-48.png": "img_sql",
  "icons8-telegram-app-48.png": "img_telegram",
  "icons8-tiktok-48.png": "img_tiktok",
  "icons8-website-48.png": "img_website",
  "icons8-windows-copilot-48.png": "img_win_copilot",
  "icons8-x-48.png": "img_x",
  "icons8-youtube-48.png": "img_youtube",
  "icons8-클로드-아이-48.png": "img_claude",
  "icons8-amazon-web-services-48.png": "img_aws",
  "icons8-azure-50.png": "img_azure",
  "icons8-book-50.png": "img_book",
  "icons8-camera-50.png": "img_camera",
  "icons8-camera-50-2.png": "img_camera2",
  "icons8-company-50.png": "img_company",
  "icons8-download-50.png": "img_download",
  "icons8-folder-48.png": "img_folder",
  "icons8-folder-50.png": "img_folder2",
  "icons8-github-50.png": "img_github",
  "icons8-google-코드-48.png": "img_gcode",
  "icons8-handshake-50.png": "img_handshake",
  "icons8-javascript-48.png": "img_js",
  "icons8-light-on-50.png": "img_idea",
  "icons8-magnetic-card-50.png": "img_card",
  "icons8-microsoft-365-50.png": "img_m365",
  "icons8-microsoft-teams-50.png": "img_teams",
  "icons8-ms-edge-새-50.png": "img_edge",
  "icons8-mysql-logo-50.png": "img_mysql",
  "icons8-natural-user-interface-50.png": "img_finger",
  "icons8-online-support-50.png": "img_support",
  "icons8-plus-50.png": "img_plus",
  "icons8-rstudio-48.png": "img_rstudio",
  "icons8-save-50.png": "img_save",
  "icons8-search-50.png": "img_search",
  "icons8-shopping-cart-50.png": "img_cart",
  "icons8-sql-50.png": "img_sql2",
  "icons8-standing-man-50.png": "img_person",
  "icons8-truck-50.png": "img_truck",
  "icons8-twitter-bird-48.png": "img_twitter",
  "icons8-user-50.png": "img_user",
  "icons8-user-groups-50.png": "img_users",
  "icons8-visual-basic-48.png": "img_vb",
  "icons8-문서-서명-50.png": "img_sign",
  "icons8-비주얼-스튜디오-코드-2019-48.png": "img_vscode",
  "icons8-사과-카메라-50.png": "img_photo",
  "icons8-우편-50.png": "img_post",
  "icons8-이메일-50.png": "img_email",
  "icons8-콘솔-48.png": "img_console",
  "icons8-프로그램-작성-48.png": "img_code",
};

export interface PresetIcon {
  id: string;
  name: string;
  file: string;
  url: string;
}

function fileNameOf(path: string): string {
  const raw = path.split("/").pop() ?? path;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export const PRESET_ICONS: PresetIcon[] = Object.entries(files)
  .map(([path, url]) => {
    const file = fileNameOf(path);
    return {
      id: IDS[file] ?? `img_${file.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase() || "icon"}`,
      name: LABELS[file] ?? file.replace(/^icons8-/, "").replace(/-\d+\.png$/i, ""),
      file,
      url,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

export async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
