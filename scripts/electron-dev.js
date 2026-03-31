// Launcher script that removes ELECTRON_RUN_AS_NODE before starting Electron
// This env var is set by VS Code and prevents Electron from running as a desktop app
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
  env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
