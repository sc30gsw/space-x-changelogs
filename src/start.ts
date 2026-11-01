import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { requireBasicAuth } from "./server/basic-auth";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === "serverFn",
    }),
    requireBasicAuth,
  ],
}));
