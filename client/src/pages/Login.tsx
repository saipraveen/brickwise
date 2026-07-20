import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AuthResponse } from "shared";
import {
  validateUsername,
  validatePassword,
  validateEmail,
  storeAuthResponse,
} from "../utils/auth";
import "./Login.css";

type Mode = "login" | "register";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");

  // Form fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline validation errors (shown on blur or submit)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  const validateField = (field: string, value: string): string | undefined => {
    switch (field) {
      case "username": {
        const result = validateUsername(value);
        return result.valid ? undefined : result.error;
      }
      case "email": {
        const result = validateEmail(value);
        return result.valid ? undefined : result.error;
      }
      case "password": {
        const result = validatePassword(value);
        return result.valid ? undefined : result.error;
      }
      case "confirmPassword": {
        if (value !== password) return "Passwords do not match";
        return undefined;
      }
      default:
        return undefined;
    }
  };

  const handleBlur = (field: string, value: string) => {
    if (!value) return; // Don't validate empty fields on blur
    const err = validateField(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: err }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string | undefined> = {};

    errors.username = validateField("username", username);
    errors.password = validateField("password", password);

    if (mode === "register") {
      errors.email = validateField("email", email);
      errors.confirmPassword = validateField("confirmPassword", confirmPassword);
    }

    setFieldErrors(errors);
    return !Object.values(errors).some(Boolean);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setLoading(true);

    try {
      const url =
        mode === "login"
          ? `${API_BASE}/auth/login`
          : `${API_BASE}/auth/register`;

      const body =
        mode === "login"
          ? JSON.stringify({ username, password })
          : JSON.stringify({ username, password, email });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const message =
          errData?.message || (mode === "login" ? "Login failed" : "Registration failed");
        setError(message);
        return;
      }

      const data: AuthResponse = await response.json();
      storeAuthResponse(data);
      navigate("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setError(null);
    setFieldErrors({});
  };

  return (
    <div className="page login-page">
      <h2>{mode === "login" ? "Sign In" : "Create Account"}</h2>

      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}

      <form className="login-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <div className="form-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => handleBlur("username", username)}
            autoComplete="username"
            required
            aria-invalid={!!fieldErrors.username}
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
          />
          {fieldErrors.username && (
            <span id="username-error" className="field-error" role="alert">
              {fieldErrors.username}
            </span>
          )}
        </div>

        {mode === "register" && (
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => handleBlur("email", email)}
              autoComplete="email"
              required
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email && (
              <span id="email-error" className="field-error" role="alert">
                {fieldErrors.email}
              </span>
            )}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => handleBlur("password", password)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            aria-invalid={!!fieldErrors.password}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
          />
          {fieldErrors.password && (
            <span id="password-error" className="field-error" role="alert">
              {fieldErrors.password}
            </span>
          )}
        </div>

        {mode === "register" && (
          <div className="form-field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => handleBlur("confirmPassword", confirmPassword)}
              autoComplete="new-password"
              required
              aria-invalid={!!fieldErrors.confirmPassword}
              aria-describedby={
                fieldErrors.confirmPassword ? "confirm-password-error" : undefined
              }
            />
            {fieldErrors.confirmPassword && (
              <span id="confirm-password-error" className="field-error" role="alert">
                {fieldErrors.confirmPassword}
              </span>
            )}
          </div>
        )}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading
            ? mode === "login"
              ? "Signing in..."
              : "Creating account..."
            : mode === "login"
              ? "Sign In"
              : "Create Account"}
        </button>
      </form>

      <p className="mode-switch">
        {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
        <button type="button" className="switch-btn" onClick={switchMode}>
          {mode === "login" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

export default Login;
