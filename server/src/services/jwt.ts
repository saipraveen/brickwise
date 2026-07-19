import jwt from "jsonwebtoken";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

interface AccessTokenPayload {
  userId: string;
  username: string;
  type: "access";
}

interface RefreshTokenPayload {
  userId: string;
  type: "refresh";
}

export type TokenPayload = AccessTokenPayload | RefreshTokenPayload;

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

/**
 * Generate an access token with 15-minute expiry.
 */
export function generateAccessToken(
  userId: string,
  username: string,
): string {
  const payload: AccessTokenPayload = { userId, username, type: "access" };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate a refresh token with 7-day expiry.
 */
export function generateRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = { userId, type: "refresh" };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Verify a token and return the decoded payload.
 * Throws if the token is invalid or expired.
 */
export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  return decoded as TokenPayload;
}

/**
 * Generate both access and refresh tokens for a user.
 */
export function generateTokenPair(
  userId: string,
  username: string,
): { accessToken: string; refreshToken: string } {
  return {
    accessToken: generateAccessToken(userId, username),
    refreshToken: generateRefreshToken(userId),
  };
}
