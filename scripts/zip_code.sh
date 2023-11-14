#!/bin/bash

cd ..

zip -r csv.zip . -x "node_modules/*" -x "dist/*"