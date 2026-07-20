# Neon PostgreSQL - Serverless database
#
# This manages the Neon project, branch, endpoint, and role.
# The database schema/migrations are handled by Drizzle ORM (application-level).
#
# To import an existing Neon project:
#   terraform import neon_project.main <project-id>
#   terraform import neon_branch.main <project-id>:<branch-id>

import {
  to = neon_project.main
  id = "still-flower-03882155"
}

resource "neon_project" "main" {
  name       = var.project_name
  region_id  = var.neon_region
  org_id     = var.neon_org_id
  pg_version = 18

  default_endpoint_settings {
    autoscaling_limit_min_cu = 0.25
    autoscaling_limit_max_cu = 2
    suspend_timeout_seconds  = 300
  }
}

# The main branch (created automatically with the project, but tracked here)
resource "neon_branch" "main" {
  project_id = neon_project.main.id
  name       = "main"
}

# Database role for the application
resource "neon_role" "app" {
  project_id = neon_project.main.id
  branch_id  = neon_branch.main.id
  name       = "brickwise_app"
}

# The default database
resource "neon_database" "main" {
  project_id = neon_project.main.id
  branch_id  = neon_branch.main.id
  name       = "neondb"
  owner_name = neon_role.app.name
}
