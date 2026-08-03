import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAccessToken } from "../utils/auth";

/** Redirects to /login, preserving the intended destination, when no token is stored. */
function RequireAuth() {
  const location = useLocation();

  if (!getAccessToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export default RequireAuth;
