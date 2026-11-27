#!/usr/bin/env bash
# List classic UI commits (views/extjs3, views/Extjs3, views/goui) that a merge of the upstream branch brought
# into a neo branch and that still need a neo port: the merge carries PHP, language and updates.php over, but
# never views/neo. Works in neo-ui (upstream origin/master) and in the amd/sf neo worktrees (upstream 26.0.x).
#
#   scripts/neo-port-check.sh [-C DIR] [--upstream REF] [--quiet] [A..B]
#
# Without a range: the commits of the last upstream merge on the first-parent line of HEAD. With A..B: the
# commits of every upstream merge on the first-parent line in A..B. Also listed: upstream commits with the
# trailer `Port-to: neo`. Left out: commits a neo commit after A records as `Ported-from: <full hash>` or
# `Port-skipped: <full hash> <reason>`.
# Output: per commit and module the hash, subject, classic files and the module's views/neo/PORTING.md (the
# map to the neo files); a module without views/neo is reported as "no neo views yet". Last line is a summary.
# Exit: 0 nothing to port, 1 commits to port in modules with neo views, 2 error.
set -euo pipefail

dir=. upstream= quiet= range=
while [ $# -gt 0 ]; do
	case "$1" in
		-C) dir=$2; shift 2 ;;
		--upstream) upstream=$2; shift 2 ;;
		--quiet) quiet=1; shift ;;
		-h|--help) sed -n '2,15p' "$0"; exit 0 ;;
		*..*) range=$1; shift ;;
		*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done

g() { git -C "$dir" "$@"; }
top=$(g rev-parse --show-toplevel) || exit 2

if [ -z "$upstream" ]; then
	# a GroupOffice core checkout (neo-ui) follows master, a module repo (amd, sf) 26.0.x
	if [ -d "$top/www/go/core" ]; then candidates="origin/master master"; else candidates="26.0.x origin/26.0.x"; fi
	for c in $candidates; do
		if g rev-parse -q --verify "$c^{commit}" >/dev/null; then upstream=$c; break; fi
	done
	[ -n "$upstream" ] || { echo "no upstream branch found ($candidates); pass --upstream" >&2; exit 2; }
fi

g rev-parse -q --verify "$upstream^{commit}" >/dev/null || { echo "unknown upstream ref: $upstream" >&2; exit 2; }

# 0 when merge $1 brought upstream commits, 1 when not; any other git status is an error
is_upstream_merge() {
	local rc=0
	g merge-base --is-ancestor "$1^2" "$upstream" || rc=$?
	[ "$rc" -le 1 ] || exit 2
	return "$rc"
}

if [ -z "$range" ]; then
	last=
	for m in $(g rev-list --first-parent --merges HEAD); do
		if is_upstream_merge "$m"; then last=$m; break; fi
	done
	[ -n "$last" ] || { echo "neo-port-check: no merge of $upstream into $(g branch --show-current) found"; exit 0; }
	range="$last^1..$last"
fi
from=${range%%..*}
to=${range#*..}
to=${to:-HEAD}
for ref in "$from" "$to"; do
	g rev-parse -q --verify "$ref^{commit}" >/dev/null || { echo "unknown revision: $ref" >&2; exit 2; }
done

merges=
fp=$(g rev-list --first-parent --merges "$from..$to") || exit 2
for m in $fp; do
	is_upstream_merge "$m" && merges="$merges $m"
done

# full hashes a neo commit (not an upstream one) already ported or skipped
done_list=$(g log --format='%(trailers:key=Ported-from,valueonly)%n%(trailers:key=Port-skipped,valueonly)' "$from..HEAD" --not "$upstream" \
	| awk 'length($1) == 40 { print $1 }')

# one record per commit: \x1e full hash \x1f short hash \x1f subject \x1f Port-to values, then its files
log=
for m in $merges; do
	log="$log$(g log --no-merges --reverse --abbrev=9 --name-only --no-renames \
		--format='%x1e%H%x1f%h%x1f%s%x1f%(trailers:key=Port-to,valueonly,separator=%x2c)' "$m^1..$m^2")"
done

report=$(printf '%s' "$log" | DONE="$done_list" TOP="$top" awk -v RS='\036' -F'\n' -v q="'" '
BEGIN {
	n = split(ENVIRON["DONE"], d, "\n"); for (i = 1; i <= n; i++) done[d[i]] = 1
	pending = 0; noviews = 0
}
# one single-quoted shell word: module names come from commits, the shell must not expand them
function sq(p) { gsub(q, q "\\" q q, p); return q p q }
NF > 0 && $1 != "" {
	split($1, h, "\037")
	if (h[1] in done) next
	delete files; delete mods; nmods = 0
	for (i = 2; i <= NF; i++) {
		if (!match($i, /(^|\/)views\/(extjs3|Extjs3|goui)\//)) continue
		mod = substr($i, 1, RSTART - 1)
		if (!(mod in mods)) { mods[mod] = 1; order[++nmods] = mod }
		files[mod] = files[mod] "    " $i "\n"
	}
	if (nmods == 0) {
		if (tolower(h[4]) !~ /(^|, *)neo( *,|$)/) next
		order[++nmods] = "-"; files["-"] = "    (no classic view files; marked Port-to: neo)\n"
	}
	for (k = 1; k <= nmods; k++) {
		mod = order[k]
		# core: www/views/Extjs3, www/views/goui and www/go/core/views/extjs3 all map to www/views/neo
		neo = (mod == "www" || mod == "www/go/core") ? "www/views/neo" : mod "/views/neo"
		if (mod == "-") { note = "see the commit"; pending++ }
		else if (system("test -d " sq(ENVIRON["TOP"] "/" neo)) == 0) {
			note = (system("test -f " sq(ENVIRON["TOP"] "/" neo "/PORTING.md")) == 0) ? "map: " neo "/PORTING.md" : "neo views: " neo " (no PORTING.md)"
			pending++
		} else { note = "no neo views yet"; noviews++ }
		printf "%s %s  %s  [%s]\n%s", h[2], mod, h[3], note, files[mod]
	}
}
END { printf "%d %d\n", pending, noviews }')
counts=$(printf '%s\n' "$report" | tail -n 1)
pending=${counts% *} noviews=${counts#* }
out=$(printf '%s\n' "$report" | sed '$d')

[ -n "$quiet" ] || [ -z "$out" ] || printf '%s\n' "$out"
echo "neo-port-check: $pending to port, $noviews in modules without neo views ($range, upstream $upstream)"
[ "$pending" -eq 0 ] || exit 1
