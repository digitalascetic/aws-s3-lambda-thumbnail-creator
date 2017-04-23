#!/usr/bin/env bash

if ! [[ -e LICENSE ]]
  then
    echo
    echo "ZIP file can just be generated from project root"
    echo
    exit 1
fi

if  [[ -e thumbnails.zip ]]
  then
    rm thumbnails.zip
fi

zip -r thumbnails.zip index.js node_modules LICENSE package.json configuration.js