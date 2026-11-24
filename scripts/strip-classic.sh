#!/usr/bin/env bash
#
# Removes the classic webclient (ExtJS 3 and GOUI) from an assembled GroupOffice package, so it
# ships the neo webclient only (docs/neo-switch.md section 8).
#
# Usage: strip-classic.sh [--allow-without-neo=<module,...>] [--check-only] <package dir>
#
#   --allow-without-neo  Modules that may ship with a classic UI but without a neo UI. Their
#                        classic files stay in the package, but no user can reach them. A module
#                        is named by its path below go/modules ("business/finance") or by its
#                        folder name below modules ("projects2"). May be given more than once.
#   --check-only         Run the parity gate only, remove nothing.
#
# Parity gate: fails, listing the modules, when a module in the package has a classic UI
# (views/extjs3, views/Extjs3, views/goui or a non-empty scripts.txt in its folder) but no
# views/neo, unless it is allowed with --allow-without-neo.
#
# Removes:
#   - views/Extjs3, views/goui and views/Layout.php (the classic client)
#   - of every module with views/neo: views/extjs3, views/Extjs3, views/goui and, for legacy
#     modules, the classic scripts in the module folder (scripts.txt and *.js)
#   - package.json, package-lock.json and node_modules of the package root (the npm workspace
#     of GOUI; pdfjs-dist there is only used by the classic files module)

set -euo pipefail

ALLOWED=()
CHECK_ONLY=false
PACKAGE_DIR=""

for arg in "$@"; do
	case "$arg" in
		--allow-without-neo=*)
			IFS=, read -ra list <<< "${arg#*=}"
			ALLOWED+=(${list[@]+"${list[@]}"})
			;;
		--check-only) CHECK_ONLY=true ;;
		-*) echo "Unknown argument: $arg" >&2; exit 1 ;;
		*) PACKAGE_DIR="$arg" ;;
	esac
done

if [[ -z "$PACKAGE_DIR" || ! -f "$PACKAGE_DIR/version.php" ]]; then
	echo "Usage: $0 [--allow-without-neo=<module,...>] [--check-only] <package dir>" >&2
	echo "The package dir must be an assembled www folder (with version.php)." >&2
	exit 1
fi

PACKAGE_DIR="$(cd "$PACKAGE_DIR" && pwd)"

if [[ ! -d "$PACKAGE_DIR/views/neo" ]]; then
	echo "ERROR: $PACKAGE_DIR has no views/neo: it would have no webclient at all" >&2
	exit 1
fi

# Module folders of the package: go/modules/<package>/<name> and the legacy modules/<name>
module_dirs() {
	local dir
	for dir in "$PACKAGE_DIR"/go/modules/*/*/ "$PACKAGE_DIR"/modules/*/; do
		[[ -d "$dir" ]] && echo "${dir%/}"
	done
}

# "business/finance" for go/modules/business/finance, "projects2" for modules/projects2
module_name() {
	local rel="${1#"$PACKAGE_DIR"/}"
	case "$rel" in
		go/modules/*) echo "${rel#go/modules/}" ;;
		modules/*) echo "${rel#modules/}" ;;
	esac
}

has_legacy_scripts() {
	[[ -f "$1/scripts.txt" ]] && grep -q '[^[:space:]]' "$1/scripts.txt"
}

has_classic_ui() {
	[[ -d "$1/views/extjs3" || -d "$1/views/Extjs3" || -d "$1/views/goui" ]] || has_legacy_scripts "$1"
}

is_allowed() {
	local name=$1 allowed
	for allowed in ${ALLOWED[@]+"${ALLOWED[@]}"}; do
		[[ "$allowed" == "$name" ]] && return 0
	done
	return 1
}

missing=()
allowed_missing=()
with_neo=()

while IFS= read -r dir; do
	name="$(module_name "$dir")"
	if [[ -d "$dir/views/neo" ]]; then
		with_neo+=("$dir")
	elif has_classic_ui "$dir"; then
		if is_allowed "$name"; then
			allowed_missing+=("$name")
		else
			missing+=("$name")
		fi
	fi
done < <(module_dirs)

for name in ${ALLOWED[@]+"${ALLOWED[@]}"}; do
	if [[ ! " ${allowed_missing[*]-} " == *" $name "* ]]; then
		echo "WARNING: --allow-without-neo=$name: no such module with a classic UI and without neo in the package" >&2
	fi
done

if [[ ${#allowed_missing[@]} -gt 0 ]]; then
	echo "Allowed without a neo UI (classic files stay, unreachable): ${allowed_missing[*]}"
fi

if [[ ${#missing[@]} -gt 0 ]]; then
	{
		echo "ERROR: parity gate: these modules have a classic UI but no views/neo:"
		printf '  %s\n' "${missing[@]}"
		echo "Port them to neo, leave them out of the package, or allow them explicitly with"
		echo "  --allow-without-neo=$(IFS=,; echo "${missing[*]}")"
	} >&2
	exit 1
fi

echo "Parity gate passed: every module with a classic UI has views/neo"

if [[ "$CHECK_ONLY" == true ]]; then
	exit 0
fi

echo "Removing the classic client from $PACKAGE_DIR"

rm -rf "$PACKAGE_DIR/views/Extjs3" "$PACKAGE_DIR/views/goui" "$PACKAGE_DIR/views/Layout.php"
rm -rf "$PACKAGE_DIR/package.json" "$PACKAGE_DIR/package-lock.json" "$PACKAGE_DIR/node_modules"

for dir in ${with_neo[@]+"${with_neo[@]}"}; do
	rm -rf "$dir/views/extjs3" "$dir/views/Extjs3" "$dir/views/goui"
	if [[ -f "$dir/scripts.txt" ]]; then
		rm -f "$dir/scripts.txt"
		find "$dir" -maxdepth 1 -type f -name '*.js' -delete
	fi
done

echo "Removed the classic client of the core and of ${#with_neo[@]} modules with views/neo"
