import { FONT, TEXT_COLOR } from "./chartTokens";

export const legendBottom = {
  bottom: 0,
  left: "center" as const,
  itemWidth: 12,
  itemHeight: 12,
  icon: "circle" as const,
  textStyle: { color: TEXT_COLOR, fontSize: FONT.legend },
};

export function legendScroll(hasZoom = false) {
  return {
    bottom: hasZoom ? 30 : 0,
    left: "center" as const,
    type: "scroll" as const,
    selector: [
      { type: "all" as const, title: "All" },
      { type: "inverse" as const, title: "Invert" },
    ],
    textStyle: { fontSize: FONT.legendSm, color: TEXT_COLOR },
  };
}
