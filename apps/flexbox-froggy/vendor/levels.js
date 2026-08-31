/* English-only extract of thomaspark/flexboxfroggy levels + docs.
 * Full locales live upstream; they ballooned the GIF past what a lesson needs.
 */
var LEVELS = [
  {
    "name": "justify-content 1",
    "instructions": "<p>Welcome to Flexbox Froggy, a game where you help Froggy and friends by writing CSS code! Guide this frog to the lilypad on the right by using the <code>justify-content</code> property, which aligns items horizontally and accepts the following values:</p><ul><li><code>flex-start</code>: Items align to the left side of the container.</li><li><code>flex-end</code>: Items align to the right side of the container.</li><li><code>center</code>: Items align at the center of the container.</li><li><code>space-between</code>: Items display with equal spacing between them.</li><li><code>space-around</code>: Items display with equal spacing around them.</li></ul><p>For example, <code>justify-content: flex-end;</code> will move the frog to the right.</p>",
    "board": "g",
    "style": {
      "justify-content": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "justify-content 2",
    "instructions": "<p>Use <code>justify-content</code> again to help these frogs get to their lilypads. Remember that this CSS property aligns items horizontally and accepts the following values:</p><ul><li><code>flex-start</code>: Items align to the left side of the container.</li><li><code>flex-end</code>: Items align to the right side of the container.</li><li><code>center</code>: Items align at the center of the container.</li><li><code>space-between</code>: Items display with equal spacing between them.</li><li><code>space-around</code>: Items display with equal spacing around them.</li></ul>",
    "board": "gy",
    "style": {
      "justify-content": "center"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "justify-content 3",
    "instructions": "<p>Help all three frogs find their lilypads just by using <code>justify-content</code>. This time, the lilypads have lots of space all around them.</p><p>If you find yourself forgetting the possible values for a property, you can click on the property name to view them. Try clicking on <code>justify-content</code>.</p>",
    "board": "gyr",
    "style": {
      "justify-content": "space-around"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "justify-content 4",
    "instructions": "<p>Now the lilypads on the edges have drifted to the shore, increasing the space between them. Use <code>justify-content</code>. This time, the lilypads have equal spacing between them.</p>",
    "board": "gyr",
    "style": {
      "justify-content": "space-between"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "align-items 1",
    "instructions": "<p>Now use <code>align-items</code> to help the frogs get to the bottom of the pond. This CSS property aligns items vertically and accepts the following values:</p><ul><li><code>flex-start</code>: Items align to the top of the container.</li><li><code>flex-end</code>: Items align to the bottom of the container.</li><li><code>center</code>: Items align at the vertical center of the container.</li><li><code>baseline</code>: Items display at the baseline of the container.</li><li><code>stretch</code>: Items are stretched to fit the container.</li></ul>",
    "board": "gyr",
    "style": {
      "align-items": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "align-items 2",
    "instructions": "<p>Lead the frog to the center of the pond using a combination of <code>justify-content</code> and <code>align-items</code>.</p>",
    "board": "g",
    "style": {
      "justify-content": "center",
      "align-items": "center"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "align-items 3",
    "instructions": "<p>The frogs need to cross the pond again, this time for some lilypads with plenty of space around them. Use a combination of <code>justify-content</code> and <code>align-items</code>.</p>",
    "board": "gyr",
    "style": {
      "justify-content": "space-around",
      "align-items": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-direction 1",
    "instructions": "<p>The frogs need to get in the same order as their lilypads using <code>flex-direction</code>. This CSS property defines the direction items are placed in the container, and accepts the following values:</p><ul><li><code>row</code>: Items are placed the same as the text direction.</li><li><code>row-reverse</code>: Items are placed opposite to the text direction.</li><li><code>column</code>: Items are placed top to bottom.</li><li><code>column-reverse</code>: Items are placed bottom to top.</li></ul>",
    "board": "gyr",
    "style": {
      "flex-direction": "row-reverse"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-direction 2",
    "instructions": "<p>Help the frogs find their column of lilypads using <code>flex-direction</code>. This CSS property defines the direction items are placed in the container, and accepts the following values:</p><ul><li><code>row</code>: Items are placed the same as the text direction.</li><li><code>row-reverse</code>: Items are placed opposite to the text direction.</li><li><code>column</code>: Items are placed top to bottom.</li><li><code>column-reverse</code>: Items are placed bottom to top.</li></ul>",
    "board": "gyr",
    "style": {
      "flex-direction": "column"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-direction 3",
    "instructions": "<p>Help the frogs get to their own lilypads. Although they seem close, it will take both <code>flex-direction</code> and <code>justify-content</code> to get them there.</p><p>Notice that when you set the direction to a reversed row or column, start and end are also reversed.</p>",
    "board": "gyr",
    "style": {
      "flex-direction": "row-reverse",
      "justify-content": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-direction 4",
    "instructions": "<p>Help the frogs find their lilypads using <code>flex-direction</code> and <code>justify-content</code>.</p><p>Notice that when the flex direction is a column, <code>justify-content</code> changes to the vertical and <code>align-items</code> to the horizontal.</p>",
    "board": "gyr",
    "style": {
      "flex-direction": "column",
      "justify-content": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-direction 5",
    "instructions": "<p>Help the frogs find their lilypads using <code>flex-direction</code> and <code>justify-content</code>.</p>",
    "board": "gyr",
    "style": {
      "flex-direction": "column-reverse",
      "justify-content": "space-between"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-direction 6",
    "instructions": "<p>Help the frogs find their lilypads using <code>flex-direction</code>, <code>justify-content</code>, and <code>align-items</code>.</p>",
    "board": "gyr",
    "style": {
      "flex-direction": "row-reverse",
      "justify-content": "center",
      "align-items": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "order 1",
    "instructions": "<p>Sometimes reversing the row or column order of a container is not enough. In these cases, we can apply the <code>order</code> property to individual items. By default, items have a value of 0, but we can use this property to also set it to a positive or negative integer value (-2, -1, 0, 1, 2).</p><p>Use the <code>order</code> property to reorder the frogs according to their lilypads.</p>",
    "board": "gyr",
    "style": {
      "order": "2"
    },
    "before": "#pond {\n  display: flex;\n}\n\n.yellow {\n",
    "after": "}",
    "classes": {
      "#pond, #background": "wrap"
    },
    "selector": "> :nth-child(2)"
  },
  {
    "name": "order 2",
    "instructions": "<p>Use the <code>order</code> property to send the red frog to his lilypad.</p>",
    "board": "gggrg",
    "style": {
      "order": "-1"
    },
    "before": "#pond {\n  display: flex;\n}\n\n.red {\n",
    "after": "}",
    "classes": {
      "#pond, #background": "wrap"
    },
    "selector": "> :nth-child(4)"
  },
  {
    "name": "align-self 1",
    "instructions": "<p>Another property you can apply to individual items is <code>align-self</code>. This property accepts the same values as <code>align-items</code> and its value for the specific item.</p>",
    "board": "ggygg",
    "style": {
      "align-self": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n  align-items: flex-start;\n}\n\n.yellow {\n",
    "after": "}",
    "selector": "> :nth-child(3)"
  },
  {
    "name": "align-self 2",
    "instructions": "<p>Combine <code>order</code> with <code>align-self</code> to help the frogs to their destinations.</p>",
    "board": "ygygg",
    "style": {
      "align-self": "flex-end",
      "order": "2"
    },
    "before": "#pond {\n  display: flex;\n  align-items: flex-start;\n}\n\n.yellow {\n",
    "after": "}",
    "selector": "> .yellow"
  },
  {
    "name": "flex-wrap 1",
    "instructions": "<p>Oh no! The frogs are all squeezed onto a single row of lilypads. Spread them out using the <code>flex-wrap</code> property, which accepts the following values:</p><ul><li><code>nowrap</code>: Every item is fit to a single line.</li><li><code>wrap</code>: Items wrap around to additional lines.</li><li><code>wrap-reverse</code>: Items wrap around to additional lines in reverse.</li></ul>",
    "board": "ygggggr",
    "style": {
      "flex-wrap": "wrap"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-wrap 2",
    "instructions": "<p>Help this army of frogs form three orderly columns using a combination of <code>flex-direction</code> and <code>flex-wrap</code>.</p>",
    "board": "gggggrrrrryyyyy",
    "style": {
      "flex-direction": "column",
      "flex-wrap": "wrap"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "flex-flow 1",
    "instructions": "<p>The two properties <code>flex-direction</code> and <code>flex-wrap</code> are used so often together that the shorthand property <code>flex-flow</code> was created to combine them. This shorthand property accepts the value of the two properties separated by a space.</p><p>For example, you can use <code>flex-flow: row wrap</code> to set rows and wrap them.</p><p>Try using <code>flex-flow</code> to repeat the previous level.</p>",
    "board": "gggggrrrrryyyyy",
    "style": {
      "flex-flow": "column wrap"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  },
  {
    "name": "align-content 1",
    "instructions": "<p>The frogs are spread all over the pond, but the lilypads are bunched at the top. You can use <code>align-content</code> to set how multiple lines are spaced apart from each other. This property takes the following values:</p><ul><li><code>flex-start</code>: Lines are packed at the top of the container.</li><li><code>flex-end</code>: Lines are packed at the bottom of the container.</li><li><code>center</code>: Lines are packed at the vertical center of the container.</li><li><code>space-between</code>: Lines display with equal spacing between them.</li><li><code>space-around</code>: Lines display with equal spacing around them.</li><li><code>stretch</code>: Lines are stretched to fit the container.</li></ul><p>This can be confusing, but <code>align-content</code> determines the spacing between lines, while <code>align-items</code> determines how the items as a whole are aligned within the container. When there is only one line, <code>align-content</code> has no effect.</p>",
    "board": "ggggggggggggggg",
    "style": {
      "align-content": "flex-start"
    },
    "before": "#pond {\n  display: flex;\n  flex-wrap: wrap;\n",
    "after": "}",
    "classes": {
      "#pond, #background": "wrap"
    }
  },
  {
    "name": "align-content 2",
    "instructions": "<p>Now the current has bunched the lilypads at the bottom. Use <code>align-content</code> to guide the frogs there.</p>",
    "board": "ggggggggggggggg",
    "style": {
      "align-content": "flex-end"
    },
    "before": "#pond {\n  display: flex;\n  flex-wrap: wrap;\n",
    "after": "}",
    "classes": {
      "#pond, #background": "wrap"
    }
  },
  {
    "name": "align-content 3",
    "instructions": "<p>The frogs have had a party, but it is time to go home. Use a combination of <code>flex-direction</code> and <code>align-content</code> to get them to their lilypads.</p>",
    "board": "rgggyrgggyrgggy",
    "style": {
      "flex-direction": "column-reverse",
      "align-content": "center"
    },
    "before": "#pond {\n  display: flex;\n  flex-wrap: wrap;\n",
    "after": "}",
    "classes": {
      "#pond, #background": "wrap"
    }
  },
  {
    "name": "align-content 4",
    "instructions": "<p>Bring the frogs home one last time by using the CSS properties you've learned:</p><ul><li><code>justify-content</code></li><li><code>align-items</code></li><li><code>flex-direction</code></li><li><code>order</code></li><li><code>align-self</code></li><li><code>flex-wrap</code></li><li><code>flex-flow</code></li><li><code>align-content</code></li></ul>",
    "board": "rggggyy",
    "style": {
      "flex-direction": "column-reverse",
      "flex-wrap": "wrap-reverse",
      "align-content": "space-between",
      "justify-content": "center"
    },
    "before": "#pond {\n  display: flex;\n",
    "after": "}"
  }
];
var LEVEL_WIN = {
  "name": "win",
  "instructions": "<p>You win! Thanks to your mastery of flexbox, you were able to help all of the frogs to their lilypads. Just look how hoppy they are!</p>",
  "board": "gyrgyrgyrgyrgyrgyrgyrgyrg",
  "classes": {
    "#pond, #background": "wrap"
  },
  "style": {}
};
var DOCS = {
  "align-content": "<p>Aligns a flex container's lines within the flex container when there is extra space on the cross-axis.</p><code>flex-start</code> <code>flex-end</code> <code>center</code> <code>space-between</code> <code>space-around</code> <code>space-evenly</code> <code>stretch (default)</code>",
  "align-items": "<p>Aligns flex items along the cross axis.</p><code>flex-start</code> <code>flex-end</code> <code>center</code> <code>baseline</code> <code>stretch (default)</code>",
  "align-self": "<p>Aligns a flex item along the cross axis, overriding the <code>align-items</code> value.</p><code>flex-start</code> <code>flex-end</code> <code>center</code> <code>baseline</code> <code>stretch</code>",
  "flex-direction": "<p>Defines the direction of the main axis.</p><code>row (default)</code> <code>row-reverse</code> <code>column</code> <code>column-reverse</code>",
  "flex-flow": "<p>Shorthand property for <code>flex-direction</code> and <code>flex-wrap</code>.</p><code>&lt;flex-direction&gt; &lt;flex-wrap&gt;</code>",
  "flex-wrap": "<p>Specifies whether flex items are forced on a single line or can be wrapped on multiple lines.</p><code>nowrap (default)</code> <code>wrap</code> <code>wrap-reverse</code>",
  "justify-content": "<p>Aligns flex items along the main axis.</p><code>flex-start (default)</code> <code>flex-end</code> <code>center</code> <code>space-between</code> <code>space-around</code> <code>space-evenly</code>",
  "order": "<p>Specifies the order of the flex item.</p><code>&lt;integer&gt; (... -1, 0 (default), 1, ...)</code>"
};
