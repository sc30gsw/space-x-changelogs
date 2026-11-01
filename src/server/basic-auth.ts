import { createMiddleware } from "@tanstack/react-start";
import { timingSafeEqual } from "node:crypto";

const realm = 'Basic realm="space-x-changelogs"';

const unauthorized = (): Response =>
  new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": realm },
  });

const sameSecret = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
};

const configuredSecret = (): { readonly user: string; readonly password: string } | undefined => {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (
    typeof user !== "string" ||
    user.length === 0 ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return undefined;
  }

  return { user, password };
};

const accepts = (header: string | null, user: string, password: string): boolean => {
  if (header === null || !header.startsWith("Basic ")) {
    return false;
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return false;
  }

  return (
    sameSecret(decoded.slice(0, separator), user) &&
    sameSecret(decoded.slice(separator + 1), password)
  );
};

// Same-origin CSRF checks are not authentication.
// Unset BASIC_AUTH_USER / BASIC_AUTH_PASSWORD leaves development open, matching the README.
export const requireBasicAuth = createMiddleware({ type: "request" }).server(
  ({ request, next }) => {
    const secret = configuredSecret();
    if (secret === undefined) {
      return next();
    }

    if (!accepts(request.headers.get("authorization"), secret.user, secret.password)) {
      return unauthorized();
    }

    return next();
  },
);
