# TST-CORE-14: Assert Output Behavior, Not Incidental Wording

## Intent

<IMPORTANT>
Runtime messages, error envelopes, exit status, and emitted JSON are behavior. Assert the supported effect: emission or suppression, channel/level, structured fields, ordering, or error category as applicable. Pin exact warning, log, error, or other output wording only when it is an explicit supported contract; otherwise use behavioral or structural assertions that tolerate incidental wording changes. A request to change wording or suppress output does not by itself make that wording a permanent contract. TST-CORE-04 separately decides whether the test adds value.
</IMPORTANT>

## Fix

Keep useful tests and replace incidental exact-text expectations with behavioral or structural assertions and asymmetric matchers. Preserve exact wording only for an explicit supported contract.

## Related

[TST-CORE-04](tst-core-04.md), [TST-CORE-09](tst-core-09.md), [TST-DATA-07](tst-data-07.md)
