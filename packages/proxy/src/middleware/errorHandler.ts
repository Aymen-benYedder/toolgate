import type { NextFunction, Request, Response } from "express";

/** Error with an HTTP status — thrown by route handlers, rendered by errorHandler. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found", message: "Route not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: "api_error", message: err.message });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "internal_error", message: "Something went wrong" });
}