import { RenderError } from "./error.ts";
import { escapeHtml } from "./escape.ts";
import { remoteHref } from "./href.ts";
import { optionalString, requireObject, requireString } from "./validate.ts";

import type { BoardEntry, BoardSet } from "./types/set.ts";

/**
 * reads one board of the run, refusing an entry no reader could follow
 * @param entry the board as the set file lists it
 * @param path JSON path of `entry`, named verbatim by any refusal
 * @returns the entry, validated
 */
export function readBoardEntry(entry: BoardEntry, path: string): BoardEntry {
  requireObject<BoardEntry>(entry, path);
  const href = requireString(entry.href, `${path}.href`);
  // a board set is navigation inside one run's own directory. A remote href
  // would put an external reference in a document whose whole contract is
  // that it makes none (R6), and an absolute path resolves only on the
  // machine that wrote it — both fail at read time with nothing to say why
  if (remoteHref(href) || href.startsWith("/"))
    throw new RenderError(
      `${path}.href: ${JSON.stringify(href)} leaves the run; a board set links boards of the same run by relative path`,
    );

  return {
    id: requireString(entry.id, `${path}.id`),
    label: requireString(entry.label, `${path}.label`),
    href,
    blurb: optionalString(entry.blurb, `${path}.blurb`),
  };
}

/**
 * reads the run's boards, refusing a list that cannot be navigated
 * @param set the run's set
 * @param path JSON path of `set`, named verbatim by any refusal
 * @returns every board, validated, in the order given
 */
export function readBoards(set: BoardSet, path: string): BoardEntry[] {
  const seen = new Set<string>();

  return set.boards.map((entry, index) => {
    const board = readBoardEntry(entry, `${path}.boards[${index}]`);
    // two boards under one id give the run two entries that both claim to be
    // the current page, or neither
    if (seen.has(board.id))
      throw new RenderError(
        `${path}.boards[${index}].id: duplicate board id ${JSON.stringify(board.id)}`,
      );
    seen.add(board.id);

    return board;
  });
}

/**
 * draws the list of sibling boards a run's every board carries.
 *
 * which entry is current, and whether the list appears at all, are both
 * decided here rather than by the runtime. The legacy pipeline deferred both
 * to script because its list was one file included verbatim into every board,
 * so no per-board difference could exist at compose time. This renders the
 * list per board, from a function that is told which board it is drawing, so
 * the marking is correct in a document opened with scripting off.
 * @param set the run's boards, or `undefined` for a board rendered alone
 * @param current the `id` of the board being drawn
 * @returns the list as HTML, or an empty string when there is nothing to show
 */
export function renderBoardSet(
  set: BoardSet | undefined,
  current: string,
): string {
  if (!set) return "";
  const boards = readBoards(set, "set");
  // a run of one produces a list whose only entry is the page the reader is
  // already on, which is furniture that answers nothing
  if (boards.length < 2) return "";
  if (!boards.some((board) => board.id === current))
    throw new RenderError(
      `set.boards: does not list the board being rendered, ${JSON.stringify(current)}; the reader would have no way to tell which board they are on`,
    );
  const items = boards
    .map(
      ({ id, label, href }) =>
        `<li><a class="board-link" data-board-link="${escapeHtml(id)}" href="${escapeHtml(href)}"${id === current ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a></li>`,
    )
    .join("");

  return `<nav class="board-set" aria-label="Board set"><h3>${escapeHtml(requireString(set.label, "set.label"))}</h3><ul>${items}</ul></nav>`;
}
