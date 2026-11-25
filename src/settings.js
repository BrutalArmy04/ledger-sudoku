/* ============================================================
   SETTINGS — validate what localStorage holds before the app uses it.
   A stored value is kept only if it names a known option; anything
   else (wrong type, unknown name, an inherited name such as
   "constructor") is replaced by the default, field by field.
   ============================================================ */

export const DEFAULT_SETTINGS = {
  themeMode: "light",
  prefs: { accent: "ink", fontScale: "standard" },
};

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Own keys only: names every object inherits are not options.
const pick = (value, options, fallback) =>
  typeof value === "string" && Object.hasOwn(options, value) ? value : fallback;

// `raw` is whatever JSON.parse returned, or null. Each table's own keys are
// the valid values for that field (THEME, ACCENT_PRESETS, FONT_SCALES).
export function normalizeSettings(raw, { themes, accents, fontScales }) {
  const s = isPlainObject(raw) ? raw : {};
  const p = isPlainObject(s.prefs) ? s.prefs : {};
  return {
    themeMode: pick(s.themeMode, themes, DEFAULT_SETTINGS.themeMode),
    prefs: {
      accent: pick(p.accent, accents, DEFAULT_SETTINGS.prefs.accent),
      fontScale: pick(p.fontScale, fontScales, DEFAULT_SETTINGS.prefs.fontScale),
    },
  };
}
