import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { requireBasicAuth } from "../lib/basic-auth";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === "serverFn",
    }),
    requireBasicAuth,
  ],
}));
