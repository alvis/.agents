# Draft and render

Read from `directions/motion-design.md` steps 8 and 9. The user confirms a 1 fps draft before the full render runs once. The `hyperframes-cli` skill and installed command's `--help` own supported flags; this direction owns renderer selection, production defaults, and verification.

## Choose the renderer

<IMPORTANT>

Before any video render, ask through the question tool: "Would you like to render the final video in the cloud to speed up rendering, or locally?" Link [cloud rendering](https://hyperframes.heygen.com/deploy/cloud) and offer HeyGen managed cloud, AWS Lambda, Google Cloud Run, and local rendering. Explain that cloud uploads the project and may incur provider charges; speed depends on the project and available resources. Wait for the answer. A supplied `--cloud <name>` or an explicit choice already made in this work answers the question; do not ask again. If the user chooses cloud without a provider, ask which one, recommending HeyGen when they do not need to own infrastructure.

`--cloud <name>` is a production skill argument, not a HyperFrames CLI flag. Accept `heygen`, `aws`, `gcp`, and `local`; ask for correction on an unknown name. Record the chosen provider in the work's render settings and retain it for the final output. The 1 fps draft stays local because AWS and GCP distributed renders accept only 24, 30, or 60 fps. Tell the user this before the draft; if local draft dependencies are unavailable, resolve that prerequisite with them before rendering.

</IMPORTANT>

### Credentials and setup

Check only the chosen provider. Inspect environment variable presence without printing values, dumping the environment, or reading credential files. For example:

```bash
node -e 'for (const k of process.argv.slice(1)) console.log(k + ": " + (process.env[k] ? "set" : "missing"))' HEYGEN_API_KEY HYPERFRAMES_API_KEY
```

| Name | Credentials to check | Setup before final rendering |
| --- | --- | --- |
| `heygen` | `HEYGEN_API_KEY`, then `HYPERFRAMES_API_KEY`; otherwise `npx hyperframes auth status --json` checks saved login without exposing it. | Use existing configured credentials. If none resolve, ask the user to supply `HEYGEN_API_KEY` through the environment's secret facility or hidden-input `npx hyperframes auth login --api-key`, then recheck. See [authentication](https://hyperframes.heygen.com/guides/authentication). |
| `aws` | `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, plus `AWS_SESSION_TOKEN` for temporary credentials; `AWS_PROFILE`, SSO, shared credentials, or a workload role can satisfy the AWS SDK chain without these variables. | Verify the selected identity with `aws sts get-caller-identity` without logging credential values. Requires `@hyperframes/aws-lambda` alongside the CLI and an existing stack's metadata, stack name, and region. If undeployed, follow [AWS Lambda](https://hyperframes.heygen.com/deploy/aws-lambda): AWS SAM CLI, Bun, and a HyperFrames checkout or `HYPERFRAMES_REPO_ROOT`, then `npx hyperframes lambda deploy --stack-name <stack> --region <region>`. |
| `gcp` | `GOOGLE_APPLICATION_CREDENTIALS` names a credential file; Application Default Credentials or a workload identity may already resolve without it. API keys such as `GOOGLE_API_KEY` do not authorize Cloud Run rendering. | Verify ADC with `gcloud auth application-default print-access-token` with stdout suppressed. Requires `@hyperframes/gcp-cloud-run` alongside the CLI and deployed project, region, bucket, service, and workflow metadata. If undeployed, follow [Google Cloud Run](https://hyperframes.heygen.com/deploy/gcp-cloud-run): a billing-enabled project, authenticated `gcloud`, Terraform, and a compatible image or HyperFrames checkout, then `npx hyperframes cloudrun deploy --project <project>`. |
| `local` | No cloud credentials. | Confirm local Chrome and FFmpeg through `npx hyperframes doctor`. |

<IMPORTANT>

For AWS or GCP, ask for the missing provider credentials or profile/service-account setup only after checking the existing chain; never request a HeyGen key for them. If verification fails, distinguish absent credentials from expired credentials, denied permissions, missing tools, or missing deployment metadata; report the actual failure and ask for the corresponding repair. Request keys through a secret facility or hidden input, never in committed files, command arguments, logs, or render manifests. Recheck after the user supplies them. Pause cloud submission until credentials and deployment are ready; do not silently fall back to local or another cloud.

</IMPORTANT>

Reuse existing infrastructure. When new deployment or a missing dependency installation is needed, present its concrete setup command and obtain approval before running it unless already authorized. Hosted [Vercel, Cloudflare, and Modal templates](https://hyperframes.heygen.com/guides/deploy) provide application endpoints rather than these CLI render backends; a requested template requires its own deployment workflow, not an invented `--cloud` CLI option.

## Draft

1. Run `npx hyperframes check --snapshots` and fix every finding.
2. Snapshot every sync point and every moment a title, lyric, or caption leaves the screen, with the times read from the timing data object: `npx hyperframes snapshot --at <t1>,<t2>,...`. Text that lingers past its exit can fall between draft frames, and it is the fault most likely to force a second full render.
3. Render the draft: `npx hyperframes render --fps 1 --quality draft --workers <n> -o <slug>-draft-r<N>.mp4`, with `<n>` as [full render](#full-render) sets it. Observed in October 2026 on a 4-core container: 107 frames for a 107-second piece captured in 24 seconds with 3 workers.
4. Review the draft yourself as a contact sheet, one frame per second, before the user sees it.
5. Shrink it for the page (`ffmpeg -i <draft> -vf scale=540:-2 -c:v libx264 -crf 30 -c:a aac -b:a 96k -movflags +faststart <small>.mp4`; 22 MB became 4 MB in that run) and write one standalone HTML page that plays it with the song: the video inlined as a data URI, play and pause, a scrubber, and a readout of the time and music section, so the page opens anywhere with no other file. Publish it where the user can open it, such as the harness's shareable page.
6. Ask the user to confirm it through the question tool. This is the animatic lock in [music](directions/motion-design/music.md#approval-locks): feedback goes back to the build or the music, and a revision redrafts before any full render.

## Full render

Render once after the draft is confirmed and the chosen backend is ready. Final exports explicitly use `--fps 24 --quality standard` unless the user or delivery platform requires a different setting; record any override and confirm that the backend supports it. Run the selected command from the project directory, replacing placeholders with the approved project settings:

```bash
# --cloud local
npx hyperframes render . --fps 24 --quality standard \
  --workers <n> --output <slug>-r<N>-master.mp4

# --cloud heygen
npx hyperframes cloud render . --fps 24 --quality standard \
  --output <slug>-r<N>-master.mp4

# --cloud aws
npx hyperframes lambda render . --fps 24 --quality standard \
  --width <width> --height <height> --stack-name <stack> --region <region> \
  --output-key renders/<slug>-r<N>-master.mp4 --wait

# --cloud gcp
npx hyperframes cloudrun render . --fps 24 --quality standard \
  --width <width> --height <height> --project <project> --region <region> \
  --output-key renders/<slug>-r<N>-master.mp4 --wait
```

- For local renders, set `<n>` to the core count minus one, clamped to the installed CLI's supported range, and read `workerCount` in the render trace to confirm it. Do not pass local `--workers` or `--output` flags to distributed renders; their deployment controls concurrency and `--output-key` selects cloud storage.
- Report progress while rendering. HeyGen waits and downloads by default; AWS and GCP use `--wait`. Confirm terminal success rather than treating a submitted job as a finished file. On failure, report the job ID and provider error; inspect that job before submitting another billable render.
- HeyGen cloud archives have a 200 MB limit; use `npx hyperframes cloud render . --dry-run` before submission and exclude only unnecessary files through `.hyperframesignore`, preserving all required media.
- Download AWS's returned S3 URI with `aws s3 cp <s3-uri> <local-master-path>` or GCP's returned GCS URI with `gcloud storage cp <gs-uri> <local-master-path>`. Verify the local master exists, then inspect its frame rate, dimensions, duration, and audio with `ffprobe` and watch it with sound. Record provider, job ID when available, settings, exact input revisions, storage URI when applicable, and output hash through `track`, excluding secrets.
- Make a share copy within the platform's limit with `-movflags +faststart`, and check the encoded file as [pipeline](directions/motion-design/music/pipeline.md#hand-off-a-timing-locked-version) describes before delivery.
