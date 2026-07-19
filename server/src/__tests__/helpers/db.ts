/**
 * Test database helper - placeholder for test DB setup/teardown.
 *
 * In integration tests this will spin up a test-scoped Neon branch
 * or use a local PostgreSQL container. For unit tests, the DB layer
 * is mocked at the Drizzle ORM level.
 */

export interface TestDbContext {
  connectionUrl: string;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated test database context.
 * Currently returns a placeholder - will be wired to real test DB
 * once the Drizzle schema migration pipeline is in place.
 */
export async function createTestDb(): Promise<TestDbContext> {
  return {
    connectionUrl: "postgresql://test:test@localhost:5432/brickwise_test",
    cleanup: async () => {
      // Teardown logic will go here
    },
  };
}
