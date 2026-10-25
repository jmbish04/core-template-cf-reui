import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { clearSessionCookie, createSessionCookie } from "../../lib/cookies";
import { constantTimeEqual } from "../../lib/crypto";
import { getWorkerApiKey } from "../../utils/secrets";

const loginBodySchema = z.object({
  apiKey: z.string().min(1),
});

const authResponseSchema = z.object({
  ok: z.boolean(),
});

export const authRouter = new OpenAPIHono<{ Bindings: Env }>();

authRouter.openapi(
  createRoute({
    method: "post",
    path: "/login",
    operationId: "authLogin",
    request: {
      body: {
        content: {
          "application/json": {
            schema: loginBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Authenticated",
        content: {
          "application/json": {
            schema: authResponseSchema,
          },
        },
      },
      401: {
        description: "Invalid API key",
      },
    },
  }),
  async (c) => {
    const { apiKey } = c.req.valid("json");
    const expected = await getWorkerApiKey(c.env);
    if (!expected) {
      // Deliberately does not name the credential. Telling a stranger which
      // secret is missing tells them exactly what they are guessing at; the
      // real name is in the Worker's logs, where only the operator sees it.
      console.error("Login is unavailable: the login credential is not bound (WORKER_API_KEY).");
      return c.json({ error: "Login is temporarily unavailable." }, 503);
    }

    if (!constantTimeEqual(apiKey, expected)) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    c.header("Set-Cookie", await createSessionCookie(c.env));
    return c.json({ ok: true });
  },
);

authRouter.openapi(
  createRoute({
    method: "post",
    path: "/logout",
    operationId: "authLogout",
    responses: {
      200: {
        description: "Logged out",
        content: {
          "application/json": {
            schema: authResponseSchema,
          },
        },
      },
    },
  }),
  (c) => {
    c.header("Set-Cookie", clearSessionCookie());
    return c.json({ ok: true });
  },
);
