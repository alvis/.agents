# Publication workflow

Read this before authoring, creating, updating, reviewing, or merging a pull request or stack.

`coding:pr create|update` exclusively owns branch publication, pull-request bases, and CI. `coding:pr merge` owns merging and merges stacks bottom-up. Creating or updating a pull request must use those skills, never hand-written `git`, `jj`, or `gh` publication commands.

The selected `coding:pr` action owns publication review and closure. Reuse applicable independent evidence under [review ownership and evidence](review-evidence.md), but always verify the actual head and base, all discussions and dispositions, required authorization, local exact-revision parity, and hosted CI. No current independent evidence means no approval.

For `jj` publication mechanics, read only the shared setup and safety sections plus the selected publication recipe in the [Jujutsu guide](jj.md). Push all and only the bookmarks selected by `coding:pr`, then verify each remote head and pull-request base.
