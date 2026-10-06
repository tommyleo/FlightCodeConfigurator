const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = source.indexOf('function validateSerialAssignments()');
const end = source.indexOf('function receiverCommand()', start);
const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, {value: '', textContent: '', options: [], replaceChildren(...children) {this.options = children;}});
  return elements.get(id);
};
const buttons = Object.fromEntries(['applyReceiver', 'saveReceiver', 'applyVtx', 'saveVtx'].map(k => [k, {}]));
const state = {board: 'FLYWOOF405NANO', connected: true};
const ctx = {state, $, buttons, updateReceiverBindControls() {}, hasCapability: () => true,
  vtxTables: {HDZERO: {R: [5658]}, DEFAULT: {R: [5658]}}, vtxConfig: {table: 'DEFAULT'},
  Option: function(text, value) {this.text = text; this.value = value;},
  setValidationError() {}, renderVtxTable() {}};
vm.createContext(ctx);
vm.runInContext(source.slice(start, end), ctx);
function check(board, rx, vtx, rxDisabled, vtxDisabled) {
  state.board = board;
  $('#receiverProtocol').value = 'ELRS';
  $('#receiverSerialPort').value = rx;
  $('#vtxSerialPort').value = vtx;
  $('#vtxProtocol').value = 'HDZERO_MSP';
  ctx.validateSerialAssignments();
  assert.equal(buttons.applyReceiver.disabled, rxDisabled);
  assert.equal(buttons.applyVtx.disabled, vtxDisabled);
}
check('FLYWOOF405NANO', 'UART6', 'UART4', false, false);
check('FLYWOOF405NANO', 'UART4', 'UART6', true, true);
check('FLYWOOF405NANO', 'UART6', 'UART6', false, true);
check('FLYWOOF405NANO_ANALOG', 'UART4', 'UART6', false, false);
check('CLRACINGF4', 'UART4', 'UART6', false, false);
console.log('Flywoo HD UART6 receiver, UART4 VTX and Analog/CLRacing regression: PASS');
