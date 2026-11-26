import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings.js";
import { THEME, ACCENT_PRESETS, FONT_SCALES } from "./themes.js";

// The real tables, exactly as the app passes them.
const OPTIONS = { themes: THEME, accents: ACCENT_PRESETS, fontScales: FONT_SCALES };
const VALID = { themeMode: "dark", prefs: { accent: "forest", fontScale: "large" } };

const PROTOTYPE_KEYS = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"];
// Every way a single stored field can be wrong.
const INVALID_VALUES = ["purple", "false", "", 5, 0, true, false, null, {}, [], ["dark"], ...PROTOTYPE_KEYS];

describe("defaults", () => {
  test("every default names an own key of the real table, so renaming a preset can't break it", () => {
    expect(Object.hasOwn(THEME, DEFAULT_SETTINGS.themeMode)).toBe(true);
    expect(Object.hasOwn(ACCENT_PRESETS, DEFAULT_SETTINGS.prefs.accent)).toBe(true);
    expect(Object.hasOwn(FONT_SCALES, DEFAULT_SETTINGS.prefs.fontScale)).toBe(true);
  });

  test("results are fresh objects, not the shared defaults", () => {
    const a = normalizeSettings(null, OPTIONS);
    expect(a).toEqual(DEFAULT_SETTINGS);
    expect(a).not.toBe(DEFAULT_SETTINGS);
    expect(a.prefs).not.toBe(DEFAULT_SETTINGS.prefs);
    a.prefs.accent = "plum";
    expect(DEFAULT_SETTINGS.prefs.accent).toBe("ink");
  });
});

describe("valid settings", () => {
  test("every real option is kept", () => {
    for (const themeMode of Object.keys(THEME))
      for (const accent of Object.keys(ACCENT_PRESETS))
        for (const fontScale of Object.keys(FONT_SCALES)) {
          const raw = { themeMode, prefs: { accent, fontScale } };
          expect(normalizeSettings(raw, OPTIONS)).toEqual(raw);
        }
  });
});

describe("one invalid field falls back alone", () => {
  test.each(INVALID_VALUES.map((v) => [JSON.stringify(v) ?? String(v), v]))("themeMode %s -> light, prefs kept", (_, v) => {
    const out = normalizeSettings({ ...VALID, themeMode: v }, OPTIONS);
    expect(out).toEqual({ themeMode: "light", prefs: VALID.prefs });
  });

  test.each(INVALID_VALUES.map((v) => [JSON.stringify(v) ?? String(v), v]))("accent %s -> ink, other fields kept", (_, v) => {
    const out = normalizeSettings({ ...VALID, prefs: { ...VALID.prefs, accent: v } }, OPTIONS);
    expect(out).toEqual({ themeMode: "dark", prefs: { accent: "ink", fontScale: "large" } });
  });

  test.each(INVALID_VALUES.map((v) => [JSON.stringify(v) ?? String(v), v]))("fontScale %s -> standard, other fields kept", (_, v) => {
    const out = normalizeSettings({ ...VALID, prefs: { ...VALID.prefs, fontScale: v } }, OPTIONS);
    expect(out).toEqual({ themeMode: "dark", prefs: { accent: "forest", fontScale: "standard" } });
  });

  test("a missing field falls back alone", () => {
    expect(normalizeSettings({ prefs: VALID.prefs }, OPTIONS)).toEqual({ themeMode: "light", prefs: VALID.prefs });
    expect(normalizeSettings({ themeMode: "dark", prefs: { fontScale: "large" } }, OPTIONS).prefs).toEqual({ accent: "ink", fontScale: "large" });
    expect(normalizeSettings({ themeMode: "dark", prefs: { accent: "forest" } }, OPTIONS).prefs).toEqual({ accent: "forest", fontScale: "standard" });
  });
});

describe("wrong shapes", () => {
  test.each([["null", null], ["undefined", undefined], ["array", [VALID]], ["string", "dark"], ["number", 5], ["true", true]])(
    "settings %s -> all defaults",
    (_, raw) => {
      expect(normalizeSettings(raw, OPTIONS)).toEqual(DEFAULT_SETTINGS);
    }
  );

  test.each([["string", "x"], ["array", [VALID.prefs]], ["null", null], ["number", 5], ["missing", undefined]])(
    "prefs %s -> default prefs, themeMode kept",
    (_, prefs) => {
      expect(normalizeSettings({ themeMode: "dark", prefs }, OPTIONS)).toEqual({ themeMode: "dark", prefs: DEFAULT_SETTINGS.prefs });
    }
  );

  test("a stored settings object with an own __proto__ key (as JSON.parse makes it) is handled", () => {
    const raw = JSON.parse('{"__proto__":{"themeMode":"dark"},"themeMode":"__proto__","prefs":{"__proto__":{"accent":"plum"},"accent":"constructor"}}');
    expect(normalizeSettings(raw, OPTIONS)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("hygiene", () => {
  test("unknown extra keys are dropped", () => {
    const out = normalizeSettings({ ...VALID, extra: 1, prefs: { ...VALID.prefs, junk: true, 0: "x" } }, OPTIONS);
    expect(out).toEqual(VALID);
  });

  test("the input is not mutated", () => {
    const raw = { themeMode: "purple", prefs: { accent: "constructor", fontScale: "huge" } };
    const copy = JSON.parse(JSON.stringify(raw));
    normalizeSettings(raw, OPTIONS);
    expect(raw).toEqual(copy);
  });
});
