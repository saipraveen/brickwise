# Implementation Plan

## Overview

Fix three post-deployment bugs: missing request logger in Express server (add morgan middleware), credential exposure in Login page console output (remove/redact console.log), and auth token storage mismatch in Scan.tsx (use shared getAccessToken utility from auth.ts instead of sessionStorage).

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Post-Deployment Bugs (Missing Logger, Credential Exposure, Token Mismatch)
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate all three bugs exist
  - **Scoped PBT Approach**: Scope property to three concrete failing cases:
    - Bug 1: Send HTTP request to Express app, assert stdout contains log line with method, path, status (fails - no morgan middleware registered)
    - Bug 2: Mock `console.log`, render Login form, submit credentials, assert `console.log` was NOT called with actual password value (fails - credentials logged)
    - Bug 3: Set `localStorage.setItem("accessToken", token)`, call `getAuthToken()` from Scan.tsx, assert it returns the token (fails - reads sessionStorage which is empty)
  - Test assertions match Expected Behavior Properties from design:
    - Server produces log output for HTTP requests
    - No credential values appear in console output
    - Auth token is retrieved from localStorage
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bugs exist)
  - Document counterexamples:
    - Server produces zero log output for any request
    - `console.log` is called with raw password string
    - `getAuthToken()` returns null despite token existing in localStorage
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Server, Login, and Scan Behaviors
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: Express server parses JSON bodies and routes to correct handlers
    - Observe: Login page validates username format (3-30 chars, alphanumeric + underscore)
    - Observe: Login page validates password strength (8+ chars, uppercase, lowercase, digit)
    - Observe: `storeAuthResponse()` stores tokens in localStorage
    - Observe: Scan page UI state transitions (idle -> capturing -> processing -> reviewing -> confirmed)
    - Observe: Scan page error handling for 503, no bricks detected, timeout
    - Observe: `fetchWithAuth` from auth.ts includes Authorization header from localStorage
  - Write property-based tests capturing observed behavior:
    - For all valid JSON requests, Express server continues to parse and route correctly
    - For all username strings, `validateUsername` returns same results as before
    - For all password strings, `validatePassword` returns same results as before
    - For all auth responses, `storeAuthResponse` stores to localStorage correctly
    - For all non-Scan authenticated pages using `fetchWithAuth`, Authorization header is present
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for post-deployment bugs (missing logger, credential exposure, token mismatch)

  - [x] 3.1 Add morgan request logging middleware to Express server
    - Install `morgan` as a dependency and `@types/morgan` as a dev dependency in `server/package.json`
    - Import morgan at the top of `server/src/server.ts`
    - Register `app.use(morgan("combined"))` BEFORE route handlers (after `express.json()`)
    - This ensures all requests produce log output with method, URL, status, and response time
    - _Bug_Condition: isBugCondition(input) where input.type == "HTTP_REQUEST" AND requestLoggerMiddleware NOT IN app.middlewareStack_
    - _Expected_Behavior: stdoutContains(method, path, statusCode, responseTime) for all HTTP requests_
    - _Preservation: JSON parsing, route handling, and response logic unchanged_
    - _Requirements: 2.1, 3.1, 3.4_

  - [x] 3.2 Remove credential exposure from Login page console output
    - Locate and remove any `console.log` statement in `client/src/pages/Login.tsx` that outputs username or password values
    - If debug logging is needed, replace with redacted version or remove entirely
    - Verify no other console output in the Login component exposes sensitive form field values
    - _Bug_Condition: isBugCondition(input) where input.type == "FORM_SUBMIT" AND consoleLogContains(input.password)_
    - _Expected_Behavior: NOT consoleOutputContains(input.password) for any login submission_
    - _Preservation: Form validation, auth storage, navigation, and error handling unchanged_
    - _Requirements: 2.2, 3.2, 3.5_

  - [x] 3.3 Fix auth token storage mismatch in Scan.tsx
    - Import `getAccessToken` from `../utils/auth` in `client/src/pages/Scan.tsx`
    - Remove the local `getAuthToken()` function that reads from `sessionStorage`
    - Replace all calls to `getAuthToken()` with `getAccessToken()` from the imported utility
    - This ensures Scan reads from `localStorage` consistently with all other pages
    - _Bug_Condition: isBugCondition(input) where input.type == "API_CALL" AND tokenSource == "sessionStorage" AND actualTokenLocation == "localStorage"_
    - _Expected_Behavior: getAccessToken() returns localStorage.getItem("accessToken") for Scan page_
    - _Preservation: Scan page UI state transitions, error handling, brick review flow unchanged; other pages using fetchWithAuth unaffected_
    - _Requirements: 2.3, 2.4, 3.3_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Post-Deployment Bugs Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied:
      - Server logs HTTP requests with method, path, status, response time
      - No credential values appear in console output during login
      - Auth token is correctly retrieved from localStorage on Scan page
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all three bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Server, Login, and Scan Behaviors
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix:
      - Express server JSON parsing and routing unchanged
      - Login validation logic unchanged
      - Auth token storage unchanged
      - Other authenticated pages unchanged
      - Server 401 handling for invalid tokens unchanged

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite for both server and client
  - Ensure all property-based tests pass (bug condition and preservation)
  - Ensure no regressions in existing test suites
  - Ask the user if questions arise


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 2, "tasks": ["3.4", "3.5"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```

## Notes

- Tasks 1 and 2 are independent and can be run in parallel
- Tasks 3.1, 3.2, and 3.3 are independent implementation fixes that can be done in any order
- Tasks 3.4 and 3.5 are verification steps that must run after all implementation tasks
- The exploration test (task 1) is expected to FAIL on unfixed code - this confirms the bugs exist
- The preservation tests (task 2) are expected to PASS on unfixed code - this confirms baseline behavior
- After the fix, exploration tests should PASS and preservation tests should continue to PASS
