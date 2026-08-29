#!/bin/sh
cat 00_head.html 10_physics.js 20_store_audio.js 30_render.js 35_gl.js 40_game.js 50_ui.js 99_tail.html > ../index.html && echo "built ../index.html"
