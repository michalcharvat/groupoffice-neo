#!/usr/bin/env bash
# List classic UI commits (views/extjs3, views/Extjs3, views/goui) that a merge of the upstream branch brought
# into a neo branch and that still need a neo port: the merge carries PHP, language and updates.php over, but
# never views/neo. Works in neo-ui (upstream origin/master) and in the amd/sf neo worktrees (upstream 26.0.x).
#
#   scripts/neo-port-check.sh [-C DIR] [--upstream REF] [--quiet] [--delta] [A..B]
#
# Without a range: the commits of the last upstream merge on the first-parent line of HEAD. With A..B: the
# commits of every upstream merge on the first-parent line in A..B. Also listed, whatever the range: every
# upstream commit with the trailer `Port-to: neo` (set by go:commit), merged into neo or not yet, until a neo
# commit records it. Left out: commits a neo commit (one not on upstream) records as `Ported-from: <full hash>`
# or `Port-skipped: <full hash> <reason>`.
# Output: per commit and module the hash, subject, classic files and the module's views/neo/PORTING.md (the
# map to the neo files); a module without views/neo is reported as "no neo views yet". Under each views/extjs3
# file of a module with neo views a `delta:` line gives the neo-converter/delta.mjs command that lists the change
# config by config (docs/neo-converter-study.md); --delta also runs it and prints its output below. Last line is
# a summary.
# Exit: 0 nothing to port, 1 commits to port (in modules with neo views, or marked Port-to: neo), 2 error.
set -euo pipefail

dir=. upstream= quiet= delta= range=
while [ $# -gt 0 ]; do
	case "$1" in
		-C|--upstream) [ $# -ge 2 ] || { echo "$1 needs a value" >&2; exit 2; }
			if [ "$1" = -C ]; then dir=$2; else upstream=$2; fi; shift 2 ;;
		--quiet) quiet=1; shift ;;
		--delta) delta=1; shift ;;
		-h|--help) sed -n '2,18p' "$0"; exit 0 ;;
		*..*) range=$1; shift ;;
		*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done

g() { git -C "$dir" "$@"; }
here=$(cd "$(dirname "$0")" && pwd)
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

# the merges on the first-parent line of rev range $1 whose second parent is on upstream (they brought upstream
# commits), newest first; one rev-list of upstream instead of a merge-base per merge (neo-ui has hundreds)
upstream_merges() {
	{ g rev-list "$upstream" && g rev-list --first-parent --merges --parents "$1"; } \
		| awk 'NF == 1 { up[$1] = 1; next } NF >= 3 && ($3 in up) { print $1 }'
}

nomerge=
if [ -z "$range" ]; then
	all=$(upstream_merges HEAD) || exit 2
	last=${all%%$'\n'*}
	# no merge yet: only the commits marked Port-to: neo are listed
	if [ -n "$last" ]; then range="$last^1..$last"; else nomerge=1 range="no merge of $upstream yet"; fi
fi
merges=
if [ -z "$nomerge" ]; then
	from=${range%%..*}
	to=${range#*..}
	to=${to:-HEAD}
	for ref in "$from" "$to"; do
		g rev-parse -q --verify "$ref^{commit}" >/dev/null || { echo "unknown revision: $ref" >&2; exit 2; }
	done
	merges=$(upstream_merges "$from..$to") || exit 2
fi

# full hashes a neo commit (not an upstream one) already ported or skipped, anywhere in the neo history
done_list=$(g log --format='%(trailers:key=Ported-from,valueonly)%n%(trailers:key=Port-skipped,valueonly)' HEAD --not "$upstream" \
	| awk 'length($1) == 40 { print $1 }')
grep_neo=(-i -E --grep='^Port-to:.*neo')
# commits marked Port-to: neo that neo has not merged yet
unmerged=$(g rev-list "${grep_neo[@]}" "$upstream" --not HEAD) || exit 2

# one record per commit: \x1e full hash \x1f short hash \x1f subject \x1f Port-to values \x1f source, then its
# files. Source t: an upstream commit marked Port-to: neo (all of upstream, first), m: brought by a merge.
fmt='%x1e%H%x1f%h%x1f%s%x1f%(trailers:key=Port-to,valueonly,separator=%x2c)%x1f'
log=$(g log --reverse --diff-merges=first-parent --abbrev=9 --name-only --no-renames "${grep_neo[@]}" --format="${fmt}t" "$upstream") || exit 2
for m in $merges; do
	log="$log$(g log --no-merges --reverse --abbrev=9 --name-only --no-renames --format="${fmt}m" "$m^1..$m^2")" || exit 2
done

report=$(printf '%s' "$log" | DONE="$done_list" UNMERGED="$unmerged" TOP="$top" DELTA="$here/neo-converter/delta.mjs" awk -v RS='\036' -F'\n' -v q="'" '
BEGIN {
	n = split(ENVIRON["DONE"], d, "\n"); for (i = 1; i <= n; i++) done[d[i]] = 1
	n = split(ENVIRON["UNMERGED"], d, "\n"); for (i = 1; i <= n; i++) unmerged[d[i]] = 1
	pending = 0; noviews = 0
}
# one single-quoted shell word: module names come from commits, the shell must not expand them
function sq(p) { gsub(q, q "\\" q q, p); return q p q }
NF > 0 && $1 != "" {
	split($1, h, "\037")
	if (h[1] in done || h[1] in seen) next
	marked = tolower(h[4]) ~ /(^|, *)neo( *,|$)/
	if (h[5] == "t" && !marked) next  # the grep matched a line that is no Port-to: neo trailer
	seen[h[1]] = 1
	delete files; delete mods; delete deltas; nmods = 0
	for (i = 2; i <= NF; i++) {
		if (!match($i, /(^|\/)views\/(extjs3|Extjs3|goui)\//)) continue
		mod = substr($i, 1, RSTART - 1)
		if (!(mod in mods)) { mods[mod] = 1; order[++nmods] = mod }
		files[mod] = files[mod] "    " $i "\n"
		# the converter reads views/extjs3 of a module (not core, not goui, not the vendored libraries in lib/);
		# the line is kept only with neo views
		rest = substr($i, RSTART + RLENGTH)
		if (mod != "" && mod != "www" && mod != "www/go/core" && $i ~ /\/views\/extjs3\/.*\.js$/ && rest !~ /^lib\//)
			# the shown command, then a record for --delta: \035 cannot start a git path (git quotes control chars)
			deltas[$i] = "      delta: node " sq(ENVIRON["DELTA"]) " " sq(ENVIRON["TOP"] "/" mod) " " sq(rest) " " h[2] "^ " h[2] "\n" \
				"\035" ENVIRON["TOP"] "/" mod "\037" rest "\037" h[2] "\n"
	}
	if (nmods == 0) {
		if (!marked) next
		order[++nmods] = "-"; files["-"] = "    (no classic view files; marked Port-to: neo)\n"
	}
	counted = 0
	for (k = 1; k <= nmods; k++) {
		mod = order[k]
		# core: www/views/Extjs3, www/views/goui and www/go/core/views/extjs3 all map to www/views/neo
		neo = (mod == "www" || mod == "www/go/core") ? "www/views/neo" : mod "/views/neo"
		if (mod == "-") { note = "see the commit"; counted = 1 }
		else if (system("test -d " sq(ENVIRON["TOP"] "/" neo)) == 0) {
			note = (system("test -f " sq(ENVIRON["TOP"] "/" neo "/PORTING.md")) == 0) ? "map: " neo "/PORTING.md" : "neo views: " neo " (no PORTING.md)"
			counted = 1
			if (length(deltas)) {
				n = split(files[mod], fl, "\n"); files[mod] = ""
				for (j = 1; j < n; j++) { f = substr(fl[j], 5); files[mod] = files[mod] fl[j] "\n" (f in deltas ? deltas[f] : "") }
			}
		} else { note = "no neo views yet"; noviews++ }
		if (marked) note = note ", Port-to: neo"
		if (h[1] in unmerged) note = note ", not merged into neo yet"
		printf "%s %s  %s  [%s]\n%s", h[2], mod, h[3], note, files[mod]
	}
	# one per commit; a commit marked Port-to: neo waits even when none of its modules has neo views yet
	if (counted || marked) pending++
}
END { printf "%d %d\n", pending, noviews }')
counts=$(printf '%s\n' "$report" | tail -n 1)
pending=${counts% *} noviews=${counts#* }
out=$(printf '%s\n' "$report" | sed '$d')

failed=0
if [ -z "$quiet" ] && [ -n "$out" ]; then
	if [ -z "$delta" ]; then printf '%s\n' "$out" | grep -v $'^\035' || true
	else
		# only the \035 records run, as plain arguments: no shown text is executed
		while IFS= read -r line; do
			if [ "${line:0:1}" != $'\035' ]; then printf '%s\n' "$line"; continue; fi
			IFS=$'\037' read -r mdir file rev <<<"${line:1}"
			node "$here/neo-converter/delta.mjs" "$mdir" "$file" "$rev^" "$rev" 2>&1 | sed 's/^/        /' || failed=$((failed + 1))
		done <<<"$out"
	fi
fi
summary="neo-port-check: $pending to port, $noviews in modules without neo views"
[ "$failed" -eq 0 ] || summary="$summary, $failed delta runs failed"
echo "$summary ($range, upstream $upstream)"
[ "$pending" -eq 0 ] || exit 1
