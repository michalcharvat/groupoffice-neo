#!/bin/bash
# This script installs the NPM packages, builds the neo webclient and, when the classic client is
# there, SASS and the GOUI modules
#
# Usage: install-npm.sh [nodev] [www dir]
#
#   nodev    Don't build the type definitions
#   www dir  Directory to build in. Defaults to www of this checkout.

set -e

IS_DEV=true
if [ "$1" == "nodev" ]; then
  IS_DEV=false
  shift
fi

if [ "$IS_DEV" == "true" ]; then
  echo "DEV mode: Also building type definitions";
else
  echo "NODEV mode: Not building type definitions";
fi

SASS="npx sass --no-source-map --style=compressed"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd $DIR/../;
DIR="$(pwd)";

WWW="$( cd "${1:-$DIR/www}" && pwd )"
cd "$WWW"

# The neo webclient (default client) has its own lock file and node_modules: Neo.php serves
# views/neo/node_modules/neo.mjs by path, so it can't be hoisted into the
# www workspace. The theme build needs the dev dependencies (sass, postcss), not the GOUI
# submodules; build/build.sh turns the result into its release form (views/neo/buildScripts/release.mjs).
echo "Building neo webclient"
cd "$WWW/views/neo"
if [ "$IS_DEV" == "true" ]; then
  npm install --prefer-offline --audit=false --progress=false --fund=false
else
  npm ci --include=dev --prefer-offline --audit=false --progress=false --fund=false
fi
npm run build
cd "$WWW";
echo "DONE";

# A build without the classic client (no views/Extjs3, views/goui; docs/neo-switch.md section 8)
# has nothing more to build: the www workspace, the SASS themes and GOUI are the classic client's.
if [ ! -d views/Extjs3 ] || [ ! -d views/goui ]; then
  echo "No classic client (views/Extjs3, views/goui): skipping SASS and GOUI"
  exit 0
fi

#npm up
if [ "$IS_DEV" == "true" ]; then
  # Dev checkouts may have modules on other branches that aren't in the lock file yet
  npm install --prefer-offline --audit=false --progress=false --fund=false
else
  npm ci --prefer-offline --audit=false --progress=false --fund=false
fi

echo "Building SASS"

for line in $(find views/Extjs3 go/modules modules \( -name style.scss -o -name style-mobile.scss -o -name htmleditor.scss \) -not -path '*/goui/*' | sort -r );
do
  replace1=${line/src\/style.scss/style.css};
  replace2=${replace1/src\/style-mobile.scss/style-mobile.css};
  replace3=${replace2/src\/htmleditor.scss/htmleditor.css};
  echo $line - $replace3;
	$SASS $line $replace3;
done

function buildGOUI() {
  echo BUILDING node modules inside "$1"...
  cd "$WWW";
  for line in $(find $1 -path '*/goui/package.json' -not -path '*/node_modules/*');
  do
    local NODE_DIR="$(dirname "${line}")";
    echo "BUILD:" $NODE_DIR;
    cd $NODE_DIR;
    #npm up
    npm run build;
    if [ "$IS_DEV" == "true" ]; then
      npm run build:dts
    fi
    cd "$WWW";

  done

  echo "DONE";
}

function buildAndInstallGOUIExceptCommunityAndBusiness() {
  echo BUILDING AND INSTALL node modules inside "$1"...
  cd "$WWW";
  find "$1" \
      \( -path '*/community/*' -o -path '*/business/*' -o -path '*/node_modules/*' \) -prune -o \
      -path '*/goui/package.json' -print |
    while IFS= read -r line; do
    local NODE_DIR="$(dirname "${line}")";
    echo "BUILD:" $NODE_DIR;
    cd $NODE_DIR;
    npm ci --prefer-offline --audit=false --progress=false --fund=false;
    #npm up
    npm run build;
    if [ "$IS_DEV" == "true" ]; then
      npm run build:dts
    fi
    cd "$WWW";

  done

  echo "DONE";
}


echo "Building GOUI shared libs"
cd "$WWW";
cd ./views/goui
npm run build
if [ "$IS_DEV" == "true" ]; then
  npm run build:dts
fi

cd "$WWW";
echo "DONE";


if [ "$IS_DEV" == "true" ]; then
  find . -name tsconfig.tsbuildinfo -delete
fi

buildGOUI "./go/modules/community"
buildGOUI "./go/modules/business"
buildGOUI "./promodules"

buildAndInstallGOUIExceptCommunityAndBusiness "./go/modules"