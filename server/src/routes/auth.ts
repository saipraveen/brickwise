import { type Router as RouterType, Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { eq, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  validateUsername,
  validatePassword,
  validateEmail,
} from "../services/validation.js";
import { generateTokenPair, verifyToken } from "../services/jwt.js";
import type {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from "shared";

const router: RouterType = Router();
const BCRYPT_ROUNDS = 12;

/**
 * POST /api/auth/register
 * Creates a new user account.
 */
router.post("/register", async (req: Request, res: Response): Promise<void> => {
  const { username, password, email } = req.body as RegisterRequest;

  // Validate inputs
  const usernameResult = validateUsername(username ?? "");
  if (!usernameResult.valid) {
    res.status(400).json({ error: "validation_error", message: usernameResult.error, statusCode: 400 });
    return;
  }

  const passwordResult = validatePassword(password ?? "");
  if (!passwordResult.valid) {
    res.status(400).json({ error: "validation_error", message: passwordResult.error, statusCode: 400 });
    return;
  }

  const emailResult = validateEmail(email ?? "");
  if (!emailResult.valid) {
    res.status(400).json({ error: "validation_error", message: emailResult.error, statusCode: 400 });
    return;
  }

  // Check username/email uniqueness
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, username), eq(users.email, email)))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({
      error: "conflict",
      message: "Username or email already exists",
      statusCode: 409,
    });
    return;
  }

  // Hash password and insert user
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const [newUser] = await db
    .insert(users)
    .values({
      username,
      email,
      passwordHash,
    })
    .returning({ id: users.id, username: users.username, email: users.email });

  if (!newUser) {
    res.status(500).json({ error: "server_error", message: "Failed to create user", statusCode: 500 });
    return;
  }

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokenPair(newUser.id, newUser.username);

  const response: AuthResponse = {
    accessToken,
    refreshToken,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
    },
  };

  res.status(201).json(response);
});

/**
 * POST /api/auth/login
 * Authenticates a user by username and password.
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as LoginRequest;

  if (!username || !password) {
    res.status(400).json({
      error: "validation_error",
      message: "Username and password are required",
      statusCode: 400,
    });
    return;
  }

  // Find user by username
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user) {
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid username or password",
      statusCode: 401,
    });
    return;
  }

  // Verify password
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid username or password",
      statusCode: 401,
    });
    return;
  }

  // Generate JWT tokens
  const { accessToken, refreshToken } = generateTokenPair(user.id, user.username);

  const response: AuthResponse = {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  };

  res.status(200).json(response);
});

/**
 * POST /api/auth/refresh
 * Exchanges a valid refresh token for a new access + refresh token pair.
 */
router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as RefreshTokenRequest;

  if (!refreshToken) {
    res.status(400).json({
      error: "validation_error",
      message: "Refresh token is required",
      statusCode: 400,
    });
    return;
  }

  try {
    const payload = verifyToken(refreshToken);

    if (payload.type !== "refresh") {
      res.status(401).json({
        error: "unauthorized",
        message: "Invalid token type",
        statusCode: 401,
      });
      return;
    }

    // Look up the user to get the current username (in case it changed)
    const [user] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({
        error: "unauthorized",
        message: "User not found",
        statusCode: 401,
      });
      return;
    }

    // Generate new token pair (token rotation)
    const tokens = generateTokenPair(user.id, user.username);

    const response: RefreshTokenResponse = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };

    res.status(200).json(response);
  } catch {
    res.status(401).json({
      error: "unauthorized",
      message: "Refresh token is invalid or expired",
      statusCode: 401,
    });
  }
});

export default router;
