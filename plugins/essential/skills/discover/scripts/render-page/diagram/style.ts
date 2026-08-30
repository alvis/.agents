/** the stylesheet the `diagram` block needs, appended to the page's own. */
export const DIAGRAM_CSS = `
.diagram{display:flex; flex-direction:column; gap:.8rem; margin:0}
.diagram-title{margin:0; font-family:var(--font-display); font-weight:560; font-size:1.15rem; letter-spacing:-.015em}
/* R-8 — the drawing is emitted at its natural pixel size and is never scaled
   to fit, so its type cannot be shrunk below the small-type floor. A narrow
   viewport scrolls this frame instead. */
.diagram-frame{overflow-x:auto; padding:.4rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised)}
.diagram-frame svg{display:block; max-width:none}
/* a block wrapper inside a scroller takes the scroller's width, not the
   drawing's, which would put every pin percentage against the wrong ruler */
.diagram-frame > .pin-frame{width:max-content}

.dg-tag{font:650 .75rem/1 var(--font-mono); letter-spacing:.1em; fill:var(--ui-faint)}
.dg-label{font:560 .9rem/1 var(--font-body); fill:var(--ui-ink)}
/* the halo is painted under the glyphs, so a label stays readable wherever it
   crosses a line it does not belong to */
.dg-edge-label{font:.78rem/1 var(--font-mono); fill:var(--ui-muted); paint-order:stroke; stroke:var(--ui-raised); stroke-width:3px; stroke-linejoin:round}

/* SC-6 — role reaches the reader as tag, then stroke pattern, then stroke
   weight, and only then colour. The tag alone is injective. */
.dg-box{fill:var(--ui-canvas); stroke:var(--ui-border-strong); stroke-width:1.5}
.dg-node-client .dg-box{stroke:var(--ui-faint); stroke-dasharray:5 4}
.dg-node-edge .dg-box{stroke:var(--ui-accent); stroke-dasharray:5 4}
.dg-node-domain .dg-box{stroke:var(--ui-border-strong)}
.dg-node-engine .dg-box{stroke:var(--ui-accent); stroke-width:2.75}
.dg-node-source .dg-box{stroke:var(--ui-positive); stroke-width:2}
.dg-node-derived .dg-box{stroke:var(--ui-positive); stroke-width:1}
.dg-node-ephemeral .dg-box{stroke:var(--ui-amber); stroke-dasharray:1.5 3.5}
.dg-box-inner{fill:none; stroke:var(--ui-positive); stroke-width:1}
.dg-node:focus{outline:none}
.dg-node:focus-visible{outline:3px solid var(--ui-focus); outline-offset:3px}
.dg-node:focus-visible .dg-box{stroke:var(--ui-focus); stroke-width:3; stroke-dasharray:none}

.dg-edge{fill:none; stroke-width:1.9}
.dg-edge-flow{stroke:var(--ui-accent)}
.dg-edge-fanout{stroke:var(--ui-amber); stroke-dasharray:5 4}
.dg-edge-derive{stroke:var(--ui-positive); stroke-dasharray:2 3}
/* last, so a long-range edge reads as long-range whatever it carries; its
   arrowhead still says which kind it is */
.dg-edge-around{stroke-dasharray:9 5}
.dg-head-flow{fill:var(--ui-accent)}
.dg-head-fanout{fill:none; stroke:var(--ui-amber); stroke-width:1.6; stroke-linecap:round; stroke-linejoin:round}
.dg-head-derive{fill:var(--ui-positive)}

.diagram-legend{display:flex; flex-wrap:wrap; gap:.5rem 1.35rem; color:var(--ui-muted); font-size:.82rem}
.dg-key{display:inline-flex; gap:.5rem; align-items:center}
.dg-key-tag{padding:.12rem .42rem; border:1px solid var(--ui-border-strong); border-radius:.35rem; color:var(--ui-ink); font:650 .75rem/1.35 var(--font-mono); letter-spacing:.1em}
.dg-key-line{width:1.5rem; border-top:2px solid}
.dg-key-flow{color:var(--ui-accent)}
.dg-key-fanout{color:var(--ui-amber); border-top-style:dashed}
.dg-key-derive{color:var(--ui-positive); border-top-style:dotted}
.dg-key-around{color:var(--ui-muted); border-top-style:dashed}

/* a file tree is text, so it inherits the mono face and the reader's own size
   rather than being drawn at a fixed one */
.tree-figure{display:flex; flex-direction:column; gap:.6rem; margin:0}
.tree-title{font-family:var(--font-display); font-weight:560; font-size:1.05rem; color:var(--ui-ink)}
.tree{overflow-x:auto; margin:0; padding:.9rem 1rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); color:var(--ui-ink); font:.82rem/1.7 var(--font-mono); tab-size:2}
.tree-note{color:var(--ui-muted)}

.mermaid-figure{display:flex; flex-direction:column; gap:.8rem; margin:0}
.mermaid-canvas{overflow-x:auto; padding:.4rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised)}
.mermaid-canvas svg{display:block; max-width:none; height:auto}
/* a failed graph is stated, not hidden: the tone matches the critical callout
   so it reads as a defect in the page rather than as part of the diagram */
.mermaid-error{margin:0; padding:.7rem .9rem; border-left:3px solid var(--ui-critical); background:var(--ui-critical-soft); color:var(--ui-critical-ink); font:600 .84rem/1.5 var(--font-body)}
.mermaid-alt{margin:0; color:var(--ui-muted); font-size:.88rem}
.mermaid-source{border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
.mermaid-source summary{padding:.45rem .7rem; color:var(--ui-muted); font:650 .74rem/1.4 var(--font-mono); letter-spacing:.08em; cursor:pointer}
.mermaid-source pre{overflow-x:auto; margin:0; padding:0 .7rem .7rem; color:var(--ui-ink); font:.8rem/1.6 var(--font-mono)}
.mermaid-figure[data-mermaid-state="failed"] .mermaid-source{border-color:var(--ui-critical)}

.svg-figure{display:flex; flex-direction:column; gap:.8rem; margin:0}
/* the drawing inherits the page's ink, so a hand-authored SVG that sets no
   fill of its own follows the scheme instead of staying black in the dark */
.svg-frame{overflow-x:auto; padding:.4rem; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-raised); color:var(--ui-ink)}
.svg-frame svg{display:block; max-width:100%; height:auto}

.image-figure{display:flex; flex-direction:column; gap:.7rem; margin:0}
/* align-self is what keeps a picture at its own size: the figure is a column
   flex box, whose default stretch sets the used width and would blow a 400px
   screenshot up to the column and blur it. A max-width cannot prevent that —
   it bounds the width, it does not stop the stretch */
.image-shot{display:block; align-self:start; max-width:100%; height:auto; border:1px solid var(--ui-border); border-radius:var(--radius-card)}
/* an inlined drawing takes the page's ink, so an SVG that sets no fill of its
   own follows the scheme rather than staying black in the dark */
.image-drawing{overflow-x:auto; color:var(--ui-ink)}
.image-drawing svg{display:block; max-width:100%; height:auto}
.image-caption{margin:0; color:var(--ui-muted); font-size:.88rem}

.embed-figure{display:flex; flex-direction:column; gap:.8rem; margin:0}
.embed-chrome{overflow:hidden; border:1px solid var(--ui-border); border-radius:var(--radius-card); background:var(--ui-surface)}
.embed-chrome[data-embed-bare]{border:0; background:none}
.embed-bar{display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; padding:.5rem .7rem; border-bottom:1px solid var(--ui-border); background:var(--ui-raised)}
.embed-chrome[data-embed-bare] .embed-bar{padding:0 0 .55rem; border-bottom:0; background:none}
.embed-dots{display:flex; gap:.32rem}
.embed-dots i{width:.5rem; height:.5rem; border-radius:50%; background:var(--ui-border-strong)}
.embed-chrome[data-embed-bare] .embed-dots{display:none}
/* the URL bar is chrome, not a link: it says what page the mockup is standing
   in for, and there is nothing behind it to follow */
.embed-url{flex:1 1 12rem; min-width:0; overflow:hidden; padding:.16rem .6rem; border:1px solid var(--ui-border); border-radius:999px; background:var(--ui-surface); color:var(--ui-muted); font:.74rem/1.6 var(--font-mono); text-overflow:ellipsis; white-space:nowrap}
.embed-controls{display:flex; gap:.45rem; align-items:center; margin-left:auto}
/* the widths read as one segmented control so it is plain they are mutually
   exclusive, while rotation sits outside it as the separate thing it is */
.embed-viewports{display:flex; overflow:hidden; border:1px solid var(--ui-border); border-radius:999px}
.embed-viewport,.embed-rotate{display:inline-flex; gap:.3rem; align-items:center; padding:.3rem .55rem; border:1px solid var(--ui-border); border-radius:999px; background:var(--ui-surface); color:var(--ui-muted); font:650 .74rem/1.4 var(--font-body); cursor:pointer}
.embed-viewports .embed-viewport{border:0; border-radius:0}
.embed-viewports .embed-viewport + .embed-viewport{border-left:1px solid var(--ui-border)}
.embed-viewport:hover,.embed-rotate:hover{border-color:var(--ui-border-strong); color:var(--ui-ink)}
.embed-viewport[aria-pressed="true"],.embed-rotate[aria-pressed="true"]{border-color:var(--ui-accent); background:var(--ui-accent-soft); color:var(--ui-ink)}
.embed-viewport:focus-visible,.embed-rotate:focus-visible{outline:2px solid var(--ui-accent); outline-offset:2px}
.embed-rotate{padding:.24rem .45rem}
.embed-icon{width:1rem; height:1rem; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round}
/* the stage is the fixed box the frame is scaled inside: the frame keeps its
   declared pixel size so the embedded document lays itself out at that width,
   and the transform is what fits it into the column */
.embed-stage{position:relative; overflow:hidden; width:100%; background:var(--ui-canvas)}
.embed-frame{display:block; position:absolute; top:0; left:0; width:100%; height:100%; border:0; transform-origin:top left; background:#fff}
/* with no declared viewport there is nothing to scale to, so the frame simply
   fills the column at a stated ratio rather than at a guessed height */
.embed-figure[data-embed-fluid] .embed-stage{aspect-ratio:3/2}
.embed-figure[data-embed-fluid] .embed-frame{position:static; transform:none}
`;
