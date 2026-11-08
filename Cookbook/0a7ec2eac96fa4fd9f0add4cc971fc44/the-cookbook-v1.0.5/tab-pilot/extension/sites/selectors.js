// Volatile site selectors, in one place. When a site changes its UI, fix the value here
// (or hot-patch without a code update: tool selectors_set {site, key, value} — stored in the extension).
export const SELECTORS = {
  chatgpt: {
    editor: "form .ProseMirror",            // NOT bare .ProseMirror: "Writing" canvas blocks in chats are ProseMirror too
    modelBtn: "button[aria-label='Select ChatGPT model']",
    modelRow: "[role=menu] [role=menuitemradio], [role=menu] [aria-checked]",
    effortSlider: "[data-model-picker-power-slider] [role=slider]",
    effortStatus: "[role=menu] [role=status]",
    fileInput: "form input[type=file]:not([accept])",
    send: "button[aria-label=Send], button[data-testid=send-button]",
    stop: "button[data-testid=stop-button], button[aria-label*=Stop]",
    turn: "[data-talvt-turn-state]", turnAttr: "data-talvt-turn-state",                 // one user+assistant exchange
    unit: "[data-content-search-unit-key]", unitAttr: "data-content-search-unit-key",   // "...:user" | "...:assistant"
    userUnit: "[data-content-search-unit-key$=':user']",
    assistantHeading: "[data-conversation-role=assistant]",
    gallery: "[data-testid=generated-image-gallery]",
    addProject: "[aria-label='Add new project']",
    projectActions: "main button[aria-label='Project actions']",
    closeDialog: "button[aria-label='Close dialog']",
    codeBlock: "[data-code-block=true]",            // 2026 code block: header (lang label, buttons) + source
    codeSource: "[data-code-block-source] code",
    copyExclude: "[data-markdown-copy=exclude]",     // UI chrome inside messages (labels, buttons) — never part of the text
    modeChatText: "Chat",                            // composer mode toggle: the "Chat" button (aria-pressed=true when active)
    workMarkerText: "Open desktop app",              // only rendered in Work mode
  },
  linkedin: {
    feed: "[data-testid=mainFeed]",
    commentary: "[id^='translatable-commentary-']",
    expandableText: "[data-testid=expandable-text-box]",
    startPost: "[aria-label='Start a post']",
    composeDialog: "[data-testid=dialog]",
    textbox: "[contenteditable=true][role=textbox]",
    mediaDropZone: "[data-testid=add-media-drop-zone]",
    commentEditor: "[contenteditable=true][aria-label='Text editor for creating comment'], [contenteditable=true][aria-placeholder^='Add a comment']",
    commentButtons: "[id*=commentButtonSection] button",
    commentItem: "[id^='replaceableComment_urn:li:comment:']",
    articleTitle: "#article-editor-headline__textarea",
    articleBody: "[data-test-article-editor-content-textbox]",
    shareboxProfile: "#shareboxProfilePictureComponentRef",
  },
  tiktok: {
    fileInput: "input[type=file][accept*=video], input[type=file]",
    caption: ".public-DraftEditor-content[contenteditable=true], [contenteditable=true][role=combobox]",
    postButton: "[data-e2e=post_video_button]",
    captionFieldTitle: "Caption",            // React props.title of the field that owns the submitted caption
  },
};
