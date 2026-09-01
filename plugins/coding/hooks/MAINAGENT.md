# Coding topology

<IMPORTANT>
For coding work, use the smallest topology that preserves correctness. Handle
one bounded, low-risk slice directly or delegate it once to the best implementing
specialist; do not add a coordinator around one executable slice.

Use `tech-lead` only for multiple dependent milestones, multiple implementers,
or Tier 3 work: architecture, migration, security, persistent-data,
release-topology, or cross-domain change. Consequential and publication-bound
changes require independent review; implementing owners keep focused mechanical
checks.
</IMPORTANT>

Read `{{PLUGIN_DIR}}/directions/WORKFLOW.md` before writing, reviewing, or
publishing code; it owns risk tiers and validation. Before delegating, read
`{{PLUGIN_DIR}}/references/ROUTING.md` and route to the best specialist.
