/** one board of a run, as the set file lists it. */
export interface BoardEntry {
  /** the board's own `id`, which is what marks it as the current one */
  id: string;
  /** the name shown in every board's set list and on the hub */
  label: string;
  /** where the board is written, relative to every other board in the run */
  href: string;
  /** one line saying what the board is for, shown only on the hub */
  blurb?: string;
}

/**
 * every board a run produced, projected onto each board as it is rendered.
 *
 * this is derived from the run's own set file rather than authored per board:
 * the same labels, ids and hrefs written fifteen times would drift the first
 * time a board is added or renamed, which is the failure the legacy pipeline
 * used a shared include to avoid.
 */
export interface BoardSet {
  /** what the run is called, shown above the list */
  label: string;
  /** every board of the run, in reading order, including the current one */
  boards: BoardEntry[];
}
