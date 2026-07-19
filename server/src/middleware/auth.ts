import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/jwt.js";

/**
 * JWT authentication middleware.
 * Extracts the Bearer token from the Authorization header,
 * verifies it, and attaches user info to the request object.
 * Returns 401 if token is missing, invalid, or expired.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Authorization header",
      statusCode: 401,
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = verifyToken(token);

    if (payload.type !== "access") {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid token type",
        statusCode: 401,
      });
      return;
    }

    req.user = {
      userId: payload.userId,
      username: payload.username,
    };

    next();
  } catch {
    res.status(401).json({
      error: "Unauthorized",
      message: "Token is invalid or expired",
      statusCode: 401,
    });
  }
}
