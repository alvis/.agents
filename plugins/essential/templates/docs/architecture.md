# Architecture

## Goal

Explain the system qualities and boundaries this architecture protects.

## Requirements

List the structural requirements with stable identifiers.

## Constraints

Record the constraints that materially limit architectural choices.

## Documents

| Document | Authority | Status |
|---|---|---|
| [`<architecture-slug>.md`](<architecture-slug>.md) | <Structural concern owned here> | Current |
| [`decisions/<nnnn>-<decision-slug>.md`](decisions/<nnnn>-<decision-slug>.md) | <Accepted choice, alternatives, and consequences> | Accepted |

Architecture documents own current structural truth. An architectural
decision record (ADR) records why one choice was accepted; it does not become
a second copy of the current architecture.

<!--
The ADR table is an index of effective records only. List every ADR directly
under decisions/ and never list anything under decisions/superseded/. Read
`${ESSENTIAL_ROOT}/references/adr.md` and use
`${ESSENTIAL_ROOT}/templates/docs/adr.md`
when creating or superseding an ADR.
-->
