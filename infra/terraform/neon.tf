# Neon PostgreSQL - Serverless database
#
# This manages the Neon project. The default branch, endpoint, database,
# and role are created automatically by Neon when the project is created.
# Schema migrations are handled by Drizzle ORM (application-level).

resource "neon_project" "main" {
  name                      = var.project_name
  region_id                 = var.neon_region
  org_id                    = var.neon_org_id
  pg_version                = 18
  history_retention_seconds = 21600
}
