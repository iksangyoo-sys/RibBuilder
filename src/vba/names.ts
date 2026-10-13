const RESERVED = new Set(
  "sub function end if then else elseif dim as new set let call for next while wend do loop select case with boolean string integer long object variant public private byref byval optional and or not true false empty nothing me iribboncontrol option explicit goto exit error resume each in to step const static property type enum".split(
    " ",
  ),
);

export function vbaNameError(name: string): string {
  if (!name) return "이름을 입력하세요.";
  if (/\s/.test(name)) return "공백은 사용할 수 없습니다.";
  if (/^[0-9]/.test(name)) return "숫자로 시작할 수 없습니다.";
  if (!/^[A-Za-z가-힣_][A-Za-z0-9가-힣_]*$/.test(name)) return "영문, 한글, 숫자, 밑줄만 사용할 수 있습니다.";
  if (RESERVED.has(name.toLowerCase())) return "VBA에서 예약된 단어입니다.";
  if (name.length > 255) return "이름이 너무 깁니다.";
  return "";
}

export function isVbaName(name: string): boolean {
  return !vbaNameError(name);
}
