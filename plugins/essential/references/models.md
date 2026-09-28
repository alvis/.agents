# Model tiers and effort

**Model Tier** names the minimum framing and judgment capability: Routine handles well-specified work with local choices; Capable handles ordinary mixed work and tradeoffs; Expert handles unusually difficult judgment or framing. **Effort** names the minimum depth of investigation and checking: Instinctive is focused recognition and execution; Deliberate covers dependent steps and verification; Exhaustive covers tightly coupled, difficult analysis. These are independent axes: a focused security judgment can be Expert + Instinctive, while a mechanical test run with ordered checks can be Routine + Deliberate. The same security role doing incident reconstruction may need Expert + Exhaustive. Importance, duration, output volume, or security relevance alone does not set either axis.

Agent and skill metadata use portable `requirements.model` (`routine|capable|expert`) and `requirements.effort` (`instinctive|deliberate|exhaustive`) as independent minimums. They do not pin a native provider model or effort. [Delegating work](../directions/delegate.md) owns launch selection and eligibility.

| Native model | Model Tier | Instinctive | Deliberate | Exhaustive |
| --- | --- | --- | --- | --- |
| `gpt-6-luna` | Routine | `high`, outside normal routing | `xhigh` | `max` |
| `gpt-6-sol` | Capable | `medium` | `high` | `xhigh` |
| `gpt-6-astra` | Expert | `medium` | `high` | `xhigh` |
| `claude-haiku-4-5` | Routine | Outside normal routing | Extended-thinking budget | Larger extended-thinking budget |
| `claude-sonnet-5-5` | Capable | `medium` | `high` | `xhigh` |
| `claude-opus-5-5` | Expert | `medium` | `high` | `xhigh` |

Haiku's effort is budget-based; the table deliberately does not assert a universal token budget. Native API keys remain provider-owned. A harness that cannot expose or set a listed profile does not gain that capability from this descriptive table.
