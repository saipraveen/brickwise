# Post-Deployment Fixes Bugfix Design

## Overview

Three bugs discovered after deployment affect server observability, credential security, and authenticated API access. Bug 1 is a missing request logger in the Express server that results in zero CloudWatch visibility. Bug 2 is a credential exposure issue where the Login page logs username and password values to the browser console. Bug 3 is a storage mismatch where `Scan.tsx` reads the auth token from `sessionStorage` while `auth.ts` stores it in `localStorage`, causing all Scan API calls to fail with 401.

The fix approach is minimal and targeted: add morgan middleware to the server, remove or redact any console logging of credentials on the Login page, and replace the `sessionStorage` call in `Scan.tsx` with the shared `getAccessToken()` utility from `auth.ts`.

## Glossary

- **Bug_Condition (C)**: The set of conditions that trigger each of the three bugs - missing request logs, credential exposure in console, and token retrieval from wrong storage
- **Property (P)**: The desired correct behavior - requests are logged, credentials are never exposed, and the auth token is correctly retrieved from localStorage
- **Preservation**: Existing behaviors that must remain unchanged - JSON parsing, auth flow, form validation, other pages' authenticated API calls, and 401 handling for invalid tokens
- **`server.ts`**: The Express application entry point at `server/src/server.ts` that configures middleware and routes
- **`Login.tsx`**: The login/register page component at `client/src/pages/Login.tsx` that handles credential submission
- **`Scan.tsx`**: The brick scanning page at `client/src/pages/Scan.tsx` that makes authenticated API calls to identify bricks
- **`auth.ts`**: The shared auth utility at `client/src/utils/auth.ts` that manages token storage in localStorage
- **`getAccessToken()`**: The canonical function in `auth.ts` that retrieves the access token from `localStorage`
- **`storeAuthResponse()`**: The function in `auth.ts` that stores tokens in `localStorage` after successful login

## Bug Details

### Bug Condition

The three bugs manifest independently:

1. **Missing Request Logger**: Every HTTP request to the Express server produces no log output because no logging middleware is registered.
2. **Credential Exposure**: When a user submits the login form, a `console.log` statement outputs the raw username and password to the browser developer console.
3. **Token Storage Mismatch**: When the Scan page attempts to make an authenticated API call, it reads the token from `sessionStorage` (which is always null) instead of `localStorage` (where the token actually lives).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type SystemEvent
  OUTPUT: boolean

  // Bug 1: Any HTTP request to the server
  IF input.type == "HTTP_REQUEST" AND input.target == "express_server"
    RETURN requestLoggerMiddleware NOT IN app.middlewareStack

  // Bug 2: Login form submission
  IF input.type == "FORM_SUBMIT" AND input.page == "Login"
    RETURN consoleLogContains(input.username) OR consoleLogContains(input.password)

  // Bug 3: Scan page auth token retrieval
  IF input.type == "API_CALL" AND input.page == "Scan"
    RETURN tokenSource == "sessionStorage" AND actualTokenLocation == "localStorage"

  RETURN false
END FUNCTION
```

### Examples

- **Bug 1**: User sends `GET /api/health` - server processes request but nothing is logged to stdout/CloudWatch. Expected: `GET /api/health 200 5ms` logged.
- **Bug 2**: User submits login with username "alice" and password "Secret123!" - console shows `alice Secret123!`. Expected: no credential values in console output.
- **Bug 3**: User logs in (token stored in localStorage), navigates to Scan, captures a photo - API call to `/api/scan/identify` fails with 401. Expected: token retrieved from localStorage, request succeeds with 200.
- **Edge case - Bug 3**: User who logged in before the fix has a token in localStorage - Scan page should work immediately after the code fix without requiring re-login.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Express server continues to parse JSON request bodies up to 10mb
- All existing API routes continue to function correctly
- Login page continues to authenticate successfully and store tokens via `storeAuthResponse()` in localStorage
- Login page form validation (username format, password strength, email format) continues to show inline errors
- Other authenticated pages (Inventory, Sets, Bags) that use `fetchWithAuth` from `auth.ts` continue to work
- Server auth middleware continues to return 401 for missing, invalid, or expired tokens
- Navigation after successful login continues to redirect to the home page

**Scope:**
All inputs that do NOT involve (1) server request logging configuration, (2) console output of credential values, or (3) Scan page token retrieval should be completely unaffected by this fix. This includes:
- All non-Scan authenticated API calls (they already use `fetchWithAuth`)
- Form submission mechanics and validation logic
- Token refresh flow
- Registration flow
- Route handling and response logic

## Hypothesized Root Cause

Based on the bug description and source code analysis:

1. **Missing Request Logger**: The `server.ts` file registers `express.json()` middleware and routes but never registers a request logging middleware like morgan. This is simply an omission during initial development - the dependency may not even be installed.

2. **Credential Exposure on Login**: The Login page likely contains (or contained) a `console.log(username, password)` or similar debug statement in the `handleSubmit` function. The current code in `Login.tsx` does not show an obvious `console.log` of credentials, suggesting this may be in a build artifact or an uncommitted change. However, the bug report confirms it exists, so there may be a debug statement that was added during development and not removed.

3. **Token Storage Mismatch in Scan.tsx**: In `Scan.tsx` line 34, the `getAuthToken()` helper function uses `sessionStorage.getItem("accessToken")`. Meanwhile, `auth.ts` stores the token in `localStorage` via `localStorage.setItem("accessToken", token)`. This is a clear copy-paste or API confusion error - the Scan page was written independently of the shared auth utility.

## Correctness Properties

Property 1: Bug Condition - Request Logger Produces Output

_For any_ HTTP request received by the Express server, the server SHALL produce a log line containing the HTTP method, URL path, response status code, and response time to stdout.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Credentials Not Exposed in Console

_For any_ login form submission on the Login page, the system SHALL NOT output the actual username or password values to the browser console. Any debug logging SHALL use redacted placeholders.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Auth Token Retrieved from Correct Storage

_For any_ authenticated API call made by the Scan page, the system SHALL retrieve the auth token from `localStorage` (using the shared `getAccessToken()` utility) and include it in the Authorization header, resulting in successful API calls when the token is valid.

**Validates: Requirements 2.3, 2.4**

Property 4: Preservation - Existing Server Behavior Unchanged

_For any_ HTTP request that is not related to logging middleware configuration, the Express server SHALL continue to parse JSON bodies, route requests correctly, and return the same responses as before the fix.

**Validates: Requirements 3.1, 3.4**

Property 5: Preservation - Login Flow and Validation Unchanged

_For any_ login or registration form submission, the system SHALL continue to authenticate, store auth responses in localStorage, navigate to home, and show inline validation errors exactly as before the fix.

**Validates: Requirements 3.2, 3.5**

Property 6: Preservation - Other Authenticated Pages Unchanged

_For any_ authenticated API call made by pages other than Scan (Inventory, Sets, Bags, etc.) that use `fetchWithAuth`, the system SHALL continue to include the Authorization header and receive successful responses.

**Validates: Requirements 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `server/src/server.ts`

**Change 1 - Add request logging middleware (morgan)**:
1. Install `morgan` and `@types/morgan` as dependencies
2. Import morgan at the top of `server.ts`
3. Register `app.use(morgan("combined"))` (or `"dev"` for development) BEFORE route handlers
4. This ensures all requests are logged with method, URL, status, and response time

**File**: `client/src/pages/Login.tsx`

**Change 2 - Remove or redact credential console logging**:
1. Find and remove any `console.log` statement that outputs `username` or `password` values
2. If debug logging is needed for development, replace with redacted versions: `console.log("Login attempt for user:", username.substring(0, 2) + "***")` or remove entirely
3. Verify no other console output exposes sensitive form field values

**File**: `client/src/pages/Scan.tsx`

**Change 3 - Use shared auth utility for token retrieval**:
1. Import `getAccessToken` from `../utils/auth`
2. Replace the local `getAuthToken()` function (line 34: `return sessionStorage.getItem("accessToken")`) with usage of the imported `getAccessToken()` function
3. Either remove the local function entirely and call `getAccessToken()` directly, or update the local function body to delegate to `getAccessToken()`
4. This ensures Scan reads from `localStorage` consistently with all other pages

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise each bug condition and assert the expected behavior. Run these tests on the UNFIXED code to observe failures and confirm root causes.

**Test Cases**:
1. **Server Logger Test**: Send an HTTP request to the Express app and assert that stdout contains a log line with method, path, and status (will fail on unfixed code - no output)
2. **Login Console Test**: Mock `console.log`, submit the login form, and assert that no call contains the password value (will fail on unfixed code - password is logged)
3. **Scan Token Source Test**: Mock localStorage with a token, call the Scan page's `getAuthToken()`, and assert it returns the token (will fail on unfixed code - reads sessionStorage which is empty)
4. **Scan API Call Test**: Simulate a scan with a valid localStorage token and assert the Authorization header is present (will fail on unfixed code - header is missing)

**Expected Counterexamples**:
- Server produces zero log output for any request
- Console.log is called with raw password string
- `getAuthToken()` returns null despite token existing in localStorage
- API call to `/api/scan/identify` receives 401 despite valid login

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.bug == "missing_logger"
    result := sendRequest(input)
    ASSERT stdoutContains(method, path, statusCode, responseTime)
  IF input.bug == "credential_exposure"
    result := submitLogin(input.username, input.password)
    ASSERT NOT consoleOutputContains(input.password)
  IF input.bug == "token_mismatch"
    result := getAuthToken_fixed()
    ASSERT result == localStorage.getItem("accessToken")
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) == fixedBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-bug-related interactions, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Server Route Preservation**: Verify all API endpoints continue to return correct responses after adding morgan middleware
2. **Login Flow Preservation**: Verify form validation, auth storage, and navigation work identically after removing console.log
3. **Scan Non-Auth Behavior Preservation**: Verify Scan page UI state transitions, error handling, and brick review flow work identically after token fix
4. **fetchWithAuth Preservation**: Verify that Inventory, Sets, and other pages using `fetchWithAuth` are unaffected by the Scan.tsx change

### Unit Tests

- Test that morgan middleware is registered and produces output for various HTTP methods
- Test that Login form submission does not call console.log with credential values
- Test that `getAuthToken()` in Scan.tsx reads from localStorage
- Test that the Authorization header is correctly set when a token exists in localStorage
- Test edge cases: no token present, expired token, empty string token

### Property-Based Tests

- Generate random HTTP request methods and paths, verify each produces a log line
- Generate random username/password combinations, verify none appear in console output after login submission
- Generate random token strings stored in localStorage, verify Scan page retrieves them correctly
- Generate random API call sequences across different pages, verify all authenticated pages continue working

### Integration Tests

- Test full login flow followed by Scan page navigation and API call - verify end-to-end success
- Test server startup with morgan and verify CloudWatch-compatible log format
- Test that login, scan, and other page transitions work without credential leakage or auth failures
