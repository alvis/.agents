#!/usr/bin/env bash

# shared conventional types for branch validation and workspace identity matching
conventional_type_pattern='(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)'
# a staged-delivery draft never merges, so it takes the `wip` group instead and has no slices
canonical_branch_pattern="^(${conventional_type_pattern}/[a-z0-9]+(-[a-z0-9]+)*(/(0[1-9]|[1-9][0-9])-[a-z0-9]+(-[a-z0-9]+)*)?|wip/[a-z0-9]+(-[a-z0-9]+)*)$"
