# Lookup

Standalone lookup and nested duplicate lookup search the bound repository's open and closed issues. Only triage queue retrieval adds `is:open`; remove that qualifier before searching for duplicates. GitHub retrieval is lexical; semantic judgment ranks the resulting subset, not an imaginary exhaustive vector search.

1. Extract behavior, expected behavior, component, distinctive errors, and likely synonyms. Build several focused queries, progressively relaxing wording; do not join every symptom into one restrictive query.
2. Use this REST recipe with `QUERY` containing `repo:OWNER/REPO is:issue in:title,body` plus each chosen term set, excluding neither closed issues nor older reports for lookup. Triage queue retrieval adds `is:open`:

```bash
gh api --hostname "$HOST" --method GET search/issues -f q="$QUERY" -f sort=updated -f order=desc -F per_page="$PAGE_SIZE" -F page="$PAGE"
```

3. Start at page 1. Choose `PAGE_SIZE` at most 100 (the API page ceiling) and no greater than the remaining candidate allowance. Follow pages while results remain, respecting GitHub's 1,000-result search ceiling; split broad queries by component or time window instead of pretending deeper pagination works. Treat `incomplete_results: true` as incomplete evidence.
4. Default to 100 unique candidates and 20 detail requests per invocation to bound API/context use. Count each detail or comment-page request, even for the same issue. Search pages also consume a request ceiling of 20 by default so overlapping/empty queries cannot loop indefinitely. Allow explicit overrides. Triage and nested duplicate searches share these counters, not fresh budgets per issue.
5. Deduplicate by host/repository/number. Rank titles and bodies by behavioral match; spend detail reads on the most promising candidates, using the issue/thread recipe in `directions/github.md`. In duplicate lookup, include closed candidates: a fix that later regressed may warrant a new issue.
6. Stop when the subset supports the decision or a budget is reached. Report queries, pages, unique candidates, detail reads, truncation, and inaccessible threads. Search/auth/rate-limit errors are failures, never an empty successful result. Preserve partial results without using failed coverage as proof for creating or closing an issue.

Return ranked candidates with URL, matching behavior and circumstances, material differences, and confidence. A duplicate requires evidence of the same underlying issue; related terminology alone supports only a related match. If discussion needed to distinguish a duplicate is unread, leave the relationship uncertain. State when no match was found within the searched subset.
