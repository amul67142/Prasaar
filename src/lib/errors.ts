/**
 * One error type for services, API routes and server actions.
 * `code` is stable and machine-readable; `message` is plain words for people.
 */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public field?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`, 404);
export const forbidden = (message = "You don't have permission to do that") =>
  new AppError("FORBIDDEN", message, 403);
export const unauthorized = () => new AppError("UNAUTHORIZED", "Please log in", 401);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Shape returned by server actions to client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string; details?: unknown } };

export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (isAppError(err)) {
      return { ok: false, error: { code: err.code, message: err.message, field: err.field, details: err.details } };
    }
    // Next.js uses thrown errors for redirect()/notFound(); let those through.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(err);
    return { ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } };
  }
}
