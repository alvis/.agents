# Handover examples

```text
/essential:handover
```

Refreshes every continuable typed stream, leaves reviewing and completed
streams as overview entries, validates each staged graph, commits stream roots
last, and reconciles `.state/overview.mdc`.

```text
/essential:handover auth-refresh
```

Refreshes only the existing `auth-refresh` continuable stream while still
reconciling the project overview from every validated live root. A missing ID
does not create a stream. Legacy Markdown returns `migration_required` and no
state write occurs.

```text
/essential:takeover
```

Reads validated `works/*/state.mdc` roots and offers continuable streams. The
overview supplies project context and workspace location only after its values
agree with the stream roots.
