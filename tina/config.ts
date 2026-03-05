import { defineConfig } from "tinacms";

export default defineConfig({
  branch: process.env.GITHUB_BRANCH || "master",
  cmsCallback: (cms) => {
    if (typeof document !== "undefined") {
      const style = document.createElement("style");
      style.textContent = `
        :root {
          --tina-color-grey-0: #171717 !important;
          --tina-color-grey-1: #1e1e1e !important;
          --tina-color-grey-2: #262626 !important;
          --tina-color-grey-3: #333333 !important;
          --tina-color-grey-4: #555555 !important;
          --tina-color-grey-5: #777777 !important;
          --tina-color-grey-6: #999999 !important;
          --tina-color-grey-7: #bbbbbb !important;
          --tina-color-grey-8: #d4d4d4 !important;
          --tina-color-grey-9: #e5e5e5 !important;
          --tina-color-grey-10: #f5f5f5 !important;
          --tina-color-primary: #dc2626 !important;
          --tina-color-primary-light: #ef4444 !important;
          --tina-color-primary-dark: #b91c1c !important;
          --tina-color-error: #f97316 !important;
          --tina-color-indicator: #dc2626 !important;
          --tina-shadow-small: 0px 2px 3px rgba(0, 0, 0, 0.3) !important;
          --tina-shadow-big: 0px 2px 3px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }
        /* Base dark background */
        html, body.tina-tailwind { background-color: #171717 !important; color: #d4d4d4 !important; }
        /* Override Tina's Tailwind utility classes for dark mode */
        .tina-tailwind .bg-white { background-color: #1e1e1e !important; }
        .tina-tailwind .bg-gray-50 { background-color: #171717 !important; }
        .tina-tailwind .bg-gray-100 { background-color: #1e1e1e !important; }
        .tina-tailwind .bg-gray-150 { background-color: #262626 !important; }
        .tina-tailwind .bg-gray-200 { background-color: #333333 !important; }
        .tina-tailwind .text-gray-700 { color: #d4d4d4 !important; }
        .tina-tailwind .text-gray-600 { color: #bbbbbb !important; }
        .tina-tailwind .text-gray-500 { color: #999999 !important; }
        .tina-tailwind .text-gray-400 { color: #777777 !important; }
        .tina-tailwind .text-gray-300 { color: #555555 !important; }
        .tina-tailwind .text-gray-800 { color: #e5e5e5 !important; }
        .tina-tailwind .text-gray-900 { color: #f5f5f5 !important; }
        .tina-tailwind .border-gray-100 { border-color: #333333 !important; }
        .tina-tailwind .border-gray-150 { border-color: #333333 !important; }
        .tina-tailwind .border-gray-200 { border-color: #404040 !important; }
        .tina-tailwind .border-gray-300 { border-color: #555555 !important; }
        .tina-tailwind .hover\\:bg-gray-50:hover { background-color: #262626 !important; }
        .tina-tailwind .hover\\:bg-gray-100:hover { background-color: #262626 !important; }
        .tina-tailwind .hover\\:bg-gray-200:hover { background-color: #333333 !important; }
        .tina-tailwind .hover\\:text-blue-600:hover { color: #ef4444 !important; }
        .tina-tailwind .text-blue-500 { color: #dc2626 !important; }
        .tina-tailwind .text-blue-600 { color: #dc2626 !important; }
        .tina-tailwind .bg-blue-500 { background-color: #dc2626 !important; }
        .tina-tailwind .bg-blue-50 { background-color: #2a1a1a !important; }
        .tina-tailwind .border-blue-500 { border-color: #dc2626 !important; }
        .tina-tailwind .border-blue-200 { border-color: #7f1d1d !important; }
        .tina-tailwind .ring-blue-400 { --tw-ring-color: #dc2626 !important; }
        /* Rich text editor */
        .tina-tailwind [contenteditable] { color: #d4d4d4 !important; }
        .tina-tailwind [role="textbox"] { color: #d4d4d4 !important; }
        /* Form inputs */
        .tina-tailwind input, .tina-tailwind textarea, .tina-tailwind select {
          background-color: #262626 !important;
          color: #d4d4d4 !important;
          border-color: #404040 !important;
        }
        .tina-tailwind input:focus, .tina-tailwind textarea:focus, .tina-tailwind select:focus {
          border-color: #dc2626 !important;
        }
        /* Table rows */
        .tina-tailwind table { border-color: #333333 !important; }
        .tina-tailwind th { color: #999999 !important; }
        .tina-tailwind td a { color: #d4d4d4 !important; }
        .tina-tailwind tr:hover td { background-color: #262626 !important; }
        /* Welcome text and headings */
        .tina-tailwind h2, .tina-tailwind h3 { color: #e5e5e5 !important; }
        .tina-tailwind p { color: #bbbbbb !important; }
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
