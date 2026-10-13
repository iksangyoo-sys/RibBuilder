export class RibbonFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RibbonFileError";
  }
}

export function classifyOpenError(fileName: string, err: unknown): RibbonFileError {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx") && !name.endsWith(".xlsm") && !name.endsWith(".xlsb") && !name.endsWith(".xlam")) {
    return new RibbonFileError("구형 바이너리 형식(.xls)은 열 수 없습니다. .xlsx, .xlsm, .xlsb, .xlam 파일을 선택해 주세요.");
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/encrypted|EncryptionInfo|EncryptedPackage/i.test(message)) {
    return new RibbonFileError("암호화된 파일은 열 수 없습니다. 암호를 해제한 뒤 다시 시도해 주세요.");
  }
  if (/end of data|corrupted|invalid|not a zip/i.test(message)) {
    return new RibbonFileError("손상되었거나 엑셀 통합 문서가 아닌 파일입니다.");
  }
  return new RibbonFileError(message || "파일을 열지 못했습니다.");
}
