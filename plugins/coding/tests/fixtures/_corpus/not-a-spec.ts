// non-spec source: hook-shaped text here must NOT trip test-hooks,
// because the rule's appliesTo predicate uses supported test classification.
export function registerHooks(): void {
  beforeEach(() => {
    prime();
  });
  afterAll(() => {
    teardown();
  });
}

function beforeEach(fn: () => void): void {
  fn();
}
function afterAll(fn: () => void): void {
  fn();
}
function prime(): void {}
function teardown(): void {}
