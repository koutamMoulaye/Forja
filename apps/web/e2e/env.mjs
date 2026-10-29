// Settings shared by the end-to-end servers and tests.
export const E2E = {
  apiPort: 8765,
  webPort: 3100,
  // The fake REST API of the connector tests (tests/fake_api.py), and the test PostgreSQL
  // of docker/compose.test-db.yml (skipped when Docker does not answer).
  fakeApiPort: 8766,
  fakeApiToken: "secret-token-456",
  postgresPort: 55432,
  admin: {
    email: "admin@forja.local",
    initialPassword: "Forja-initial-2026",
    newPassword: "Nouveau-Forja-2026",
  },
  engineerEmail: "ingenieur@demo.forja.local",
  analystEmail: "analyste@demo.forja.local",
};
