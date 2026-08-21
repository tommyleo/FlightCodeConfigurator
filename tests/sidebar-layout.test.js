const assert = require("node:assert/strict");
const fs = require("node:fs");

const styles = fs.readFileSync("styles.css", "utf8");

assert.match(styles,
  /aside\{position:sticky;top:74px;align-self:start;height:calc\(100vh - 74px\)/,
  "desktop sidebar must remain pinned below the top bar");
assert.match(styles, /\.device\{position:sticky;bottom:0;/,
  "device summary must remain pinned to the sidebar bottom");
assert.match(styles, /aside\{position:sticky;top:64px;[^}]*height:auto;/,
  "mobile navigation must reset the desktop sidebar height");

console.log("Configurator sidebar layout tests passed");
