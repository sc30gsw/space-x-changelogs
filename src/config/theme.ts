import { createTheme, type MantineColorsTuple } from "@mantine/core";

const ink: MantineColorsTuple = [
  "#f4f5f6",
  "#e6e7ea",
  "#cfd2d6",
  "#a7acb3",
  "#7c838c",
  "#5b626b",
  "#3d434b",
  "#23272c",
  "#16191d",
  "#0d0f12",
];

export const theme = createTheme({
  primaryColor: "ink",
  primaryShade: 8,
  colors: { ink },
  fontFamily: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
  headings: {
    fontFamily: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "2.125rem", lineHeight: "1.25", fontWeight: "600" },
      h2: { fontSize: "1.375rem", lineHeight: "1.35", fontWeight: "600" },
      h3: { fontSize: "1.125rem", lineHeight: "1.4", fontWeight: "600" },
    },
  },
  defaultRadius: "xs",
  cursorType: "pointer",
  autoContrast: true,
  black: "#16191d",
  white: "#fbfbfc",
  focusRing: "auto",
  components: {
    Button: {
      styles: {
        root: { fontWeight: 500 },
      },
    },
    Input: {
      styles: {
        input: {
          background: "#ffffff",
          borderColor: "#d9dce1",
        },
      },
    },
  },
});
