# FUNC-ARCH-06: Options Configure One Shared Pipeline

## Intent

<IMPORTANT>
Options configure one shared implementation. They may parameterize, add, or omit stages within its processing pipeline, but must not select separately implemented processing pipelines. Separate pipelines belong in separate functions. An adapter/proxy may select among those functions when its responsibility is selection, delegation, and boundary adaptation. A violation fails acceptance even when tests pass.

The adapter allowance is part of this rule's scope. The general exception policy cannot waive a confirmed violation.
</IMPORTANT>

## Detect Separate Pipelines

Compare the processing stages, their data flow, and their orchestration across option values, following called helpers when needed. Independently orchestrated flows are separate pipelines even if they share preparation, cleanup, helpers, or a result type. Moving mode branches into helpers or renaming the selector does not establish a shared pipeline.

Apply the rule to behavioral selectors in `options`, `config`, `params`, positional arguments, or captured configuration. Ordinary input-dependent branches, validation, and error handling do not violate this rule merely because control flow differs.

Adding a compression stage or omitting writes for a dry run configures the same pipeline; neither needs an exception. Calling two complete workflows optional stages does not make them one pipeline.

## Configure Shared Stages

This output boundary shares preparation and encoding; compression adds a stage and dry run omits the write:

```typescript
interface OutputOptions {
  compress?: boolean;
  dryRun?: boolean;
}

async function writeOutput(
  records: readonly RecordData[],
  options: OutputOptions = {},
): Promise<Uint8Array> {
  const prepared = prepareRecords(records);
  const encoded = encodeRecords(prepared);
  const output = options.compress ? compressBytes(encoded) : encoded;
  if (!options.dryRun) {
    await writeBytes(output);
  }
  return output;
}
```

## Separate Workflows

This function implements two indexing workflows; a common transaction does not make their processing shared:

```typescript
async function updateIndex(options: IndexOptions = {}): Promise<void> {
  await beginIndexTransaction();
  if (options.mode === "rebuild") {
    await clearIndex();
    const records = await scanAllRecords();
    await insertRecords(records);
  } else {
    const cursor = await readIndexCursor();
    const changes = await readChanges(cursor);
    await applyChanges(changes);
  }
  await commitIndexTransaction();
}
```

Extract complete `rebuildIndex` and `updateIndexIncrementally` functions, each owning its orchestration. Calling those helpers inside the same transaction-owning, mode-switching function still leaves a workflow orchestrator; renaming that function an adapter does not qualify it.

## Bound Adapter Dispatch

A provider, format, or algorithm adapter may select a separately implemented pipeline and adapt inputs, outputs, or supported errors at its boundary. It must delegate the selected workflow's orchestration instead of performing its processing stages. Selection itself supplies behavioral value under [FUNC-ARCH-03](func-arch-03.md); unnecessary fixed pass-through wrappers remain prohibited.

```typescript
interface CompressionOptions {
  algorithm?: "gzip" | "brotli";
}

function compress(
  data: Uint8Array,
  options: CompressionOptions = {},
): Uint8Array {
  const encode = options.algorithm === "brotli" ? encodeBrotli : encodeGzip;
  return encode(data);
}
```

Here `encodeBrotli` and `encodeGzip` each own their algorithm. Inlining both algorithms into `compress`, or moving their mode checks into a shared helper that still implements both, fails acceptance.

## Acceptance

- Identify the selector and trace each selected flow through its helpers.
- Accept parameter changes and added or omitted stages within shared processing.
- For separate pipelines, require separate functions and verify any selecting proxy stays within the adapter boundary above.
- Report a violation with the divergent stages and their owning functions; passing behavior tests does not establish structural compliance.

## Related

[FUNC-ARCH-01](func-arch-01.md), [FUNC-ARCH-03](func-arch-03.md), [FUNC-STAT-04](func-stat-04.md)
