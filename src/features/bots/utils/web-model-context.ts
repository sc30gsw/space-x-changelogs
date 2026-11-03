declare global {
  interface Window {
    __webModelContextOptions?: {
      readonly transport: {
        readonly iframeServer: false;
      };
    };
  }
}

if (typeof window !== "undefined") {
  window.__webModelContextOptions = { transport: { iframeServer: false } };
}

export {};
