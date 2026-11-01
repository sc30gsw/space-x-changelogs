import { createTheme, type MantineColorsTuple } from "@mantine/core";

const cobalt: MantineColorsTuple = [
  "#e7f0f7",
  "#c9dced",
  "#a4c4e0",
  "#7aa8d0",
  "#568fc2",
  "#3b7db8",
  "#2d6496",
  "#234e76",
  "#1a3b59",
  "#12283d",
];

const signal: MantineColorsTuple = [
  "#fff3e8",
  "#ffe0c4",
  "#ffc48d",
  "#f5a45a",
  "#e8832a",
  "#d26512",
  "#b45309",
  "#8c3f08",
  "#6b2e06",
  "#4a1f04",
];

export const theme = createTheme({
  primaryColor: "cobalt",
  primaryShade: 7,
  colors: { cobalt, signal },
  fontFamily: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
  headings: {
    fontFamily: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
    fontWeight: "600",
  },
  defaultRadius: "sm",
  cursorType: "pointer",
  autoContrast: true,
  black: "#1b2836",
  white: "#f7fafc",
});
