export const THEME = {
  light: {
    bg: "#F7F6F3",
    paper: "#FFFFFF",
    ledger: "#E7E4DC",
    text: "#1C1B19",
    textMuted: "#6B6660",
    accent: "#2B4570",
    accentSoft: "#D8E1EC",
    related: "#EDF1F6",
    sameNum: "#E3E9F2",
    error: "#B5524A",
    errorSoft: "#F5E2E0",
    amber: "#C9A227",
    border: "#C9C4B8",
    boxBorder: "#2B4570",
    given: "#1C1B19",
    userNum: "#2B4570",
    note: "#8B9DAF",
  },
  dark: {
    bg: "#15140F",
    paper: "#1C1B19",
    ledger: "#262420",
    text: "#EDEAE3",
    textMuted: "#948E83",
    accent: "#6E8CB8",
    accentSoft: "#26344A",
    related: "#23282F",
    sameNum: "#2A3848",
    error: "#D1736B",
    errorSoft: "#3A2420",
    amber: "#D9B64A",
    border: "#3A3631",
    boxBorder: "#6E8CB8",
    given: "#EDEAE3",
    userNum: "#8FAAD1",
    note: "#7C8FA6",
  },
};

// Accent presets only override the small set of theme keys tied to the
// "ink" color — everything else (paper, background, borders, neutral
// text) stays as defined in THEME above, for both light and dark mode.
export const ACCENT_PRESETS = {
  ink: {
    label: "Ink Blue",
    swatch: "#2B4570",
    light: { accent: "#2B4570", accentSoft: "#D8E1EC", sameNum: "#E3E9F2", boxBorder: "#2B4570", userNum: "#2B4570" },
    dark: { accent: "#6E8CB8", accentSoft: "#26344A", sameNum: "#2A3848", boxBorder: "#6E8CB8", userNum: "#8FAAD1" },
  },
  forest: {
    label: "Forest",
    swatch: "#2F5233",
    light: { accent: "#2F5233", accentSoft: "#DCE8DC", sameNum: "#E1ECE1", boxBorder: "#2F5233", userNum: "#2F5233" },
    dark: { accent: "#6FA37A", accentSoft: "#233A28", sameNum: "#27402C", boxBorder: "#6FA37A", userNum: "#8FC29B" },
  },
  burgundy: {
    label: "Burgundy",
    swatch: "#7A2E3A",
    light: { accent: "#7A2E3A", accentSoft: "#EDDCDF", sameNum: "#F0E2E4", boxBorder: "#7A2E3A", userNum: "#7A2E3A" },
    dark: { accent: "#C77B89", accentSoft: "#3A2228", sameNum: "#40262C", boxBorder: "#C77B89", userNum: "#D699A4" },
  },
  plum: {
    label: "Plum",
    swatch: "#4B3F72",
    light: { accent: "#4B3F72", accentSoft: "#E1DCEE", sameNum: "#E6E1F0", boxBorder: "#4B3F72", userNum: "#4B3F72" },
    dark: { accent: "#9C8FC9", accentSoft: "#2E2745", sameNum: "#332B4C", boxBorder: "#9C8FC9", userNum: "#B3A8D9" },
  },
  slate: {
    label: "Slate",
    swatch: "#3F5663",
    light: { accent: "#3F5663", accentSoft: "#DCE5E9", sameNum: "#E2EAEC", boxBorder: "#3F5663", userNum: "#3F5663" },
    dark: { accent: "#7FA2B3", accentSoft: "#27343C", sameNum: "#2B3A42", boxBorder: "#7FA2B3", userNum: "#9CBAC8" },
  },
};

// Font/cell scale: controls both the board's cell size and the font size
// of digits, notes, and the number pad, so larger text always comes with
// a larger tap target.
export const FONT_SCALES = {
  standard: { label: "Standard", multiplier: 1 },
  large: { label: "Large", multiplier: 1.15 },
  xlarge: { label: "Extra Large", multiplier: 1.3 },
};
