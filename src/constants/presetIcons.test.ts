import { describe, expect, it } from "vitest";
import { PRESET_ICONS } from "./presetIcons";

describe("presetIcons", () => {
  it("아이콘 폴더의 이미지를 모두 담는다", () => {
    expect(PRESET_ICONS.length).toBeGreaterThan(0);
    expect(new Set(PRESET_ICONS.map((i) => i.id)).size).toBe(PRESET_ICONS.length);
    expect(PRESET_ICONS.every((i) => i.url && i.name)).toBe(true);
  });
});
