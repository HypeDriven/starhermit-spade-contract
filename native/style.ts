// The look of the top bar, panels, buttons and dialogs: the browser build's
// style.css, rewritten class-based in tools/ui-style.css and converted once
// with `starhermit css` into assets/ui-style.json (`npm run css`),
// registered at start with the theme the runtime's own widgets (scroll
// bars, focus rings) take, in the old "Segoe UI", system-ui stack.
import { files } from "starhermit:engine";
import * as ui from "starhermit:ui";

export const C = {
  bg: "#101c26", panel: "#182a38", panel2: "#13222e", ink: "#e8eef4", inkDim: "#9fb2c2", accent: "#e3b341",
  accentInk: "#20160a", felt: "#1d5c46", feltDeep: "#144233", card: "#f7f4ec", red: "#b3243a", line: "#2c4356",
};

export function initStyles(): void {
  const css = files.readJson("assets/ui-style.json") as unknown as ui.CssStyles;
  ui.setFont({ family: "system-ui" });
  ui.setTheme({
    fontSize: 16, smallSize: 13.6, headingSize: 17.6, padding: 8, spacing: 8, radius: 8,
    text: C.ink, muted: C.inkDim, panel: C.panel, control: C.panel, hovered: "#22394b",
    pressed: C.panel2, field: C.panel2, accent: C.accent, focus: C.accent, outline: C.line,
  });
  ui.setTokens(css.tokens);
  ui.setStyles({
    ...css.styles,
    label: { text: { color: C.ink } },
    paragraph: { text: { color: C.ink } },
    widget: { focusRing: { color: C.accent, width: 2, offset: 2 } },
    // hand cards draw their own outline (style.css button.card.playable:hover / :focus-visible)
    ".hand-card": { focusRing: "none" },
    scrollArea: { parts: { bar: { background: C.inkDim, radius: 4 } } },
    dialog: { background: "#00000000", padding: 0, parts: { backdrop: { background: "#040a0fa6" } } },
  });
}
