import { defineConfig } from "tinacms";

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || "master",
  cmsCallback: (cms) => {
    if (typeof document !== "undefined") {
      const style = document.createElement("style");
      style.textContent = `
        /* ── Color palette (edit here to retheme) ───────────── */
        :root {
          --dm-bg-base:      #171717;  /* deepest background          */
          --dm-bg-surface:   #1e1e1e;  /* cards, panels, popovers     */
          --dm-bg-elevated:  #262626;  /* inputs, muted surfaces      */
          --dm-bg-hover:     #333333;  /* hover / active highlights    */
          --dm-border:       #404040;  /* default border               */
          --dm-border-subtle:#333333;  /* lighter borders              */
          --dm-text:         #d4d4d4;  /* body text                    */
          --dm-text-bright:  #e5e5e5;  /* headings, emphasis           */
          --dm-text-max:     #f5f5f5;  /* maximum contrast text        */
          --dm-text-muted:   #999999;  /* secondary / muted text       */
          --dm-text-faint:   #777777;  /* disabled / subtle text       */
          --dm-text-dim:     #bbbbbb;  /* paragraphs                   */
          --dm-accent:       #dc2626;  /* primary accent (red-600)     */
          --dm-accent-light: #ef4444;  /* hover links (red-400)        */
          --dm-accent-dark:  #b91c1c;  /* pressed / dark variant       */
          --dm-accent-deeper:#991b1b;  /* active press                 */
          --dm-accent-bg:    #2a1a1a;  /* tinted accent background     */
          --dm-accent-border:#7f1d1d;  /* accent border                */
        }

        /* ── Tina built-in CSS variables ────────────────────── */
        :root {
          --tina-color-grey-0:  var(--dm-bg-base) !important;
          --tina-color-grey-1:  var(--dm-bg-surface) !important;
          --tina-color-grey-2:  var(--dm-bg-elevated) !important;
          --tina-color-grey-3:  var(--dm-bg-hover) !important;
          --tina-color-grey-4:  #555555 !important;
          --tina-color-grey-5:  var(--dm-text-faint) !important;
          --tina-color-grey-6:  var(--dm-text-muted) !important;
          --tina-color-grey-7:  var(--dm-text-dim) !important;
          --tina-color-grey-8:  var(--dm-text) !important;
          --tina-color-grey-9:  var(--dm-text-bright) !important;
          --tina-color-grey-10: var(--dm-text-max) !important;
          --tina-color-primary:       var(--dm-accent) !important;
          --tina-color-primary-light: var(--dm-accent-light) !important;
          --tina-color-primary-dark:  var(--dm-accent-dark) !important;
          --tina-color-error:     #f97316 !important;
          --tina-color-indicator: var(--dm-accent) !important;
          --tina-shadow-small: 0px 2px 3px rgba(0,0,0,.3) !important;
          --tina-shadow-big:   0px 2px 3px rgba(0,0,0,.2), 0 4px 12px rgba(0,0,0,.3) !important;
        }

        /* ── Base ───────────────────────────────────────────── */
        html, body.tina-tailwind { background-color: var(--dm-bg-base) !important; color: var(--dm-text) !important; }
        #root > div > div[style] { background-color: var(--dm-bg-base) !important; }

        /* ── Tailwind gray overrides ────────────────────────── */
        .tina-tailwind .bg-white, .tina-tailwind .bg-gray-100                     { background-color: var(--dm-bg-surface) !important; }
        .tina-tailwind .bg-gray-50                                                 { background-color: var(--dm-bg-base) !important; }
        .tina-tailwind .bg-gradient-to-b                                           { background-image: none !important; background-color: var(--dm-bg-base) !important; }
        .tina-tailwind .bg-gray-150                                                { background-color: var(--dm-bg-elevated) !important; }
        .tina-tailwind .bg-gray-200                                                { background-color: var(--dm-bg-hover) !important; }
        .tina-tailwind .text-black, .tina-tailwind .text-gray-700                  { color: var(--dm-text) !important; }
        .tina-tailwind .text-gray-600                                              { color: var(--dm-text-dim) !important; }
        .tina-tailwind .text-gray-500                                              { color: var(--dm-text-muted) !important; }
        .tina-tailwind .text-gray-400                                              { color: var(--dm-text-faint) !important; }
        .tina-tailwind .text-gray-300                                              { color: #555555 !important; }
        .tina-tailwind .text-gray-800                                              { color: var(--dm-text-bright) !important; }
        .tina-tailwind .text-gray-900                                              { color: var(--dm-text-max) !important; }
        .tina-tailwind .border-gray-100, .tina-tailwind .border-gray-150           { border-color: var(--dm-border-subtle) !important; }
        .tina-tailwind .border-gray-200                                            { border-color: var(--dm-border) !important; }
        .tina-tailwind .border-gray-300                                            { border-color: #555555 !important; }
        .tina-tailwind .hover\\:bg-gray-50:hover,
        .tina-tailwind .hover\\:bg-gray-100:hover                                  { background-color: var(--dm-bg-elevated) !important; }
        .tina-tailwind .hover\\:bg-gray-200:hover                                  { background-color: var(--dm-bg-hover) !important; }

        /* ── Accent: blue → red ─────────────────────────────── */
        .tina-tailwind .text-blue-500, .tina-tailwind .text-blue-600               { color: var(--dm-accent) !important; }
        .tina-tailwind .hover\\:text-blue-600:hover                                { color: var(--dm-accent-light) !important; }
        .tina-tailwind .bg-blue-500                                                { background-color: var(--dm-accent) !important; }
        .tina-tailwind .bg-blue-50                                                 { background-color: var(--dm-accent-bg) !important; }
        .tina-tailwind .border-blue-500                                            { border-color: var(--dm-accent) !important; }
        .tina-tailwind .border-blue-200                                            { border-color: var(--dm-accent-border) !important; }
        .tina-tailwind .ring-blue-400                                              { --tw-ring-color: var(--dm-accent) !important; }

        /* ── Accent: Tina orange → red ──────────────────────── */
        .tina-tailwind .bg-orange-500,   .tina-tailwind .bg-tina-orange            { background-color: var(--dm-accent) !important; }
        .tina-tailwind .bg-orange-700,   .tina-tailwind .bg-tina-orange-dark       { background-color: var(--dm-accent-dark) !important; }
        .tina-tailwind .bg-tina-orange-light                                       { background-color: var(--dm-accent-bg) !important; }
        .tina-tailwind .text-orange-500, .tina-tailwind .text-tina-orange          { color: var(--dm-accent) !important; }
        .tina-tailwind .text-tina-orange-dark                                      { color: var(--dm-accent-dark) !important; }
        .tina-tailwind .fill-orange-500, .tina-tailwind .fill-tina-orange          { fill: var(--dm-accent) !important; }
        .tina-tailwind .border-tina-orange, .tina-tailwind .border-l-tina-orange   { border-color: var(--dm-accent) !important; }
        .tina-tailwind .hover\\:bg-tina-orange:hover                               { background-color: var(--dm-accent-dark) !important; }
        .tina-tailwind .hover\\:bg-tina-orange-dark\\/90:hover                     { background-color: rgba(185,28,28,.9) !important; }
        .tina-tailwind .hover\\:text-orange-500:hover                              { color: var(--dm-accent-dark) !important; }
        .tina-tailwind .focus\\:ring-tina-orange-dark:focus                         { --tw-ring-color: var(--dm-accent-dark) !important; }
        .tina-tailwind .active\\:bg-tina-orange-dark:active                        { background-color: var(--dm-accent-deeper) !important; }
        .tina-tailwind .disabled\\:bg-tina-orange-dark\\/50:disabled               { background-color: rgba(185,28,28,.5) !important; }
        .tina-tailwind .ring-orange-500                                            { --tw-ring-color: var(--dm-accent) !important; }

        /* ── Shadcn / Radix semantic tokens ─────────────────── */
        .tina-tailwind .bg-background, .tina-tailwind .bg-popover,
        .tina-tailwind .bg-card                                                    { background-color: var(--dm-bg-surface) !important; }
        .tina-tailwind .bg-accent, .tina-tailwind .bg-muted,
        .tina-tailwind .bg-secondary                                               { background-color: var(--dm-bg-elevated) !important; }
        .tina-tailwind .bg-muted\\/50                                              { background-color: rgba(38,38,38,.5) !important; }
        .tina-tailwind .bg-border                                                  { background-color: var(--dm-border) !important; }
        .tina-tailwind .text-foreground, .tina-tailwind .text-accent-foreground,
        .tina-tailwind .text-popover-foreground, .tina-tailwind .text-secondary-foreground,
        .tina-tailwind .text-card-foreground                                       { color: var(--dm-text-bright) !important; }
        .tina-tailwind .text-muted-foreground                                      { color: var(--dm-text-muted) !important; }
        .tina-tailwind .border-border, .tina-tailwind .border-input                { border-color: var(--dm-border) !important; }

        /* ── Dropdown menus ─────────────────────────────────── */
        .tina-tailwind [role="menu"]     { background-color: var(--dm-bg-surface) !important; color: var(--dm-text) !important; border-color: var(--dm-border) !important; }
        .tina-tailwind [role="menuitemradio"],
        .tina-tailwind [role="menuitem"]                                           { color: var(--dm-text) !important; }
        .tina-tailwind [role="menuitemradio"][data-state="checked"]                 { background-color: var(--dm-bg-hover) !important; color: var(--dm-text-bright) !important; }
        .tina-tailwind [role="menuitemradio"]:hover,
        .tina-tailwind [role="menuitem"]:hover                                     { background-color: var(--dm-bg-hover) !important; color: var(--dm-text-bright) !important; }
        .tina-tailwind .hover\\:bg-accent:hover,
        .tina-tailwind .hover\\:bg-muted:hover                                     { background-color: var(--dm-bg-hover) !important; }
        .tina-tailwind .hover\\:bg-muted\\/50:hover                                { background-color: rgba(38,38,38,.5) !important; }
        .tina-tailwind .hover\\:bg-secondary\\/80:hover                            { background-color: rgba(38,38,38,.8) !important; }
        .tina-tailwind .hover\\:text-accent-foreground:hover                       { color: var(--dm-text-bright) !important; }

        /* ── Rich text editor ───────────────────────────────── */
        .tina-tailwind [contenteditable],
        .tina-tailwind [role="textbox"]  { color: var(--dm-text) !important; }
        .tina-tailwind .slate-editor     { caret-color: var(--dm-text) !important; }

        /* ── Form inputs ────────────────────────────────────── */
        .tina-tailwind input, .tina-tailwind textarea, .tina-tailwind select {
          background-color: var(--dm-bg-elevated) !important;
          color: var(--dm-text) !important;
          border-color: var(--dm-border) !important;
        }
        .tina-tailwind input:focus, .tina-tailwind textarea:focus, .tina-tailwind select:focus {
          border-color: var(--dm-accent) !important;
        }

        /* ── Table ──────────────────────────────────────────── */
        .tina-tailwind table             { border-color: var(--dm-border-subtle) !important; }
        .tina-tailwind th                { color: var(--dm-text-muted) !important; }
        .tina-tailwind td a              { color: var(--dm-text) !important; }
        .tina-tailwind tr:hover td       { background-color: var(--dm-bg-elevated) !important; }

        /* ── Typography ─────────────────────────────────────── */
        .tina-tailwind h2, .tina-tailwind h3 { color: var(--dm-text-bright) !important; }
        .tina-tailwind p                     { color: var(--dm-text-dim) !important; }
      `;
      document.head.appendChild(style);
    }
    return cms;
  },
  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      publicFolder: "public",
      mediaRoot: "uploads/blog",
    },
  },
  schema: {
    collections: [
      {
        name: "blog",
        label: "Blog Posts",
        path: "src/content/blog",
        format: "md",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Title",
            isTitle: true,
            required: true,
          },
          {
            type: "datetime",
            name: "date",
            label: "Date",
            required: true,
          },
          {
            type: "string",
            name: "summary",
            label: "Summary",
            required: true,
            ui: {
              component: "textarea",
            },
          },
          {
            type: "string",
            name: "tags",
            label: "Tags",
            list: true,
          },
          {
            type: "boolean",
            name: "draft",
            label: "Draft",
          },
          {
            type: "image",
            name: "featuredImage",
            label: "Featured Image",
          },
          {
            type: "image",
            name: "ogImage",
            label: "OG Image Override",
            description: "Custom social sharing image. If empty, one is auto-generated from the title and featured image.",
          },
          {
            type: "rich-text",
            name: "body",
            label: "Body",
            isBody: true,
          },
        ],
      },
    ],
  },
});
