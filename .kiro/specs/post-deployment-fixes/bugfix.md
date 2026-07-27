# Bugfix Requirements Document

## Introduction

Three post-deployment issues have been identified in the Lego MOC Builder application that affect server observability, credential security, and authenticated API access. The most critical bug prevents authenticated users from making API calls after login because the Scan page reads the JWT token from `sessionStorage` while the auth utility stores it in `localStorage`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the Express server receives any HTTP request THEN the system does not log any request-level information (method, route, status code, response time), resulting in zero visibility in CloudWatch

1.2 WHEN a user submits credentials on the Login page THEN the system exposes the actual username and password values in the browser console output

1.3 WHEN a user successfully logs in and navigates to the Scan page THEN the system reads the auth token from `sessionStorage.getItem("accessToken")` which returns null because the token was stored in `localStorage` by the auth utility

1.4 WHEN the Scan page calls the `/api/scan/identify` endpoint without a valid Authorization header THEN the system returns 401 "Missing or invalid Authorization header" despite the user being authenticated

### Expected Behavior (Correct)

2.1 WHEN the Express server receives any HTTP request THEN the system SHALL log the HTTP method, URL path, response status code, and response time using a request logging middleware (e.g., morgan)

2.2 WHEN a user submits credentials on the Login page THEN the system SHALL NOT expose actual username or password values in the browser console; any debug output SHALL redact sensitive credential values

2.3 WHEN a user successfully logs in and navigates to the Scan page THEN the system SHALL retrieve the auth token from `localStorage` (consistent with where `storeAuthResponse` stores it) or use the shared `getAccessToken()` utility from `auth.ts`

2.4 WHEN the Scan page calls any authenticated API endpoint THEN the system SHALL include the `Authorization: Bearer <token>` header using the correctly retrieved token, and the request SHALL succeed if the token is valid

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the Express server handles API requests THEN the system SHALL CONTINUE TO parse JSON request bodies up to 10mb and route to the correct handlers

3.2 WHEN a user submits valid credentials on the Login page THEN the system SHALL CONTINUE TO authenticate successfully, store the auth response (tokens and user info) in localStorage, and navigate to the home page

3.3 WHEN authenticated pages other than Scan (e.g., Inventory, Sets) make API calls using `fetchWithAuth` from auth.ts THEN the system SHALL CONTINUE TO include the Authorization header and receive successful responses

3.4 WHEN a request is made with an invalid or expired token THEN the server auth middleware SHALL CONTINUE TO return 401 with the appropriate error message

3.5 WHEN the Login page validates form fields (username format, password strength, email format) THEN the system SHALL CONTINUE TO show inline validation errors as before
