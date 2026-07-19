/**
 * Reusable validation functions for user registration.
 * Extracted to a separate module to support property-based testing.
 */

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a username string.
 * Rules: 3-30 characters, only alphanumeric and underscores.
 */
export function validateUsername(username: string): ValidationResult {
  if (!USERNAME_REGEX.test(username)) {
    return {
      valid: false,
      error:
        "Username must be 3-30 characters and contain only letters, numbers, and underscores",
    };
  }
  return { valid: true };
}

/**
 * Validates a password string.
 * Rules: at least 8 characters, at least one uppercase letter,
 * one lowercase letter, and one digit.
 */
export function validatePassword(password: string): ValidationResult {
  if (password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters long",
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one uppercase letter",
    };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one lowercase letter",
    };
  }
  if (!/\d/.test(password)) {
    return {
      valid: false,
      error: "Password must contain at least one digit",
    };
  }
  return { valid: true };
}

/**
 * Validates an email string (basic format check).
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || !email.includes("@") || email.length > 255) {
    return {
      valid: false,
      error: "A valid email address is required",
    };
  }
  return { valid: true };
}
