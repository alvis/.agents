# Attachments

Place local references where the media belongs within the validated PR body (`pr-body.md`):

```markdown
Before the fix:
![Before](./before.png)

After the fix:
![After](./after.png)

Demonstration:
[Video](./demo.mp4)
```

```bash
gh pr edit 123 --body-file pr-body.md \
  --attach ./before.png --attach ./after.png --attach ./demo.mp4
```

`gh` replaces the local references with uploaded URLs in place; unreferenced attachments are appended.
