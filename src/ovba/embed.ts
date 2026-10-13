import * as CFB from "cfb";
import { compressOvba } from "./compress";
import { VBA_TEMPLATE_B64 } from "./template";

function b64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function encodeWindows(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function canEmbedIntoExisting(): boolean {
  return false;
}

export function hasVbaTemplate(): boolean {
  return VBA_TEMPLATE_B64.length > 0;
}

/** 1단계: 빈 모듈이 있는 템플릿의 모듈 스트림만 교체한다. 템플릿이 없으면 최소 CFB를 만든다. */
export function buildVbaProject(source: string): Uint8Array {
  const moduleText = `Attribute VB_Name = "RibbonCallbacks"\r\n${source.replace(/\n/g, "\r\n")}`;
  const payload = new Uint8Array(1 + compressOvba(encodeWindows(moduleText)).length);
  payload[0] = 0x00;
  payload.set(compressOvba(encodeWindows(moduleText)), 1);

  const template = b64ToBytes(VBA_TEMPLATE_B64);
  if (template.length) {
    const cfb = CFB.parse(template);
    const module = cfb.FileIndex.find((e) => e && /ribboncallbacks|module1/i.test(e.name) && e.type === 2);
    if (module) {
      module.content = payload;
      module.size = payload.length;
      return Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]);
    }
  }

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, "PROJECT", encodeWindows(projectText()));
  CFB.utils.cfb_add(cfb, "VBA/RibbonCallbacks", payload);
  return Uint8Array.from(CFB.write(cfb, { type: "array" }) as number[]);
}

function projectText(): string {
  return [
    'ID="{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"',
    "Module=RibbonCallbacks",
    'Name="VBAProject"',
    "HelpContextID=\"0\"",
    "VersionCompatible32=\"393222000\"",
    "",
  ].join("\r\n");
}
