const path = require('path');

const isWindows = process.platform === 'win32';

const root = __dirname;
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const pythonPath = path.join(
  isWindows
    ? '.venv/Scripts/python.exe'
    : '.venv/bin/python'
);

module.exports = {
  apps: [
    {
      name: 'frontend',
      cwd: path.join(root, 'frontend'),
      script: path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
      args: '--host 127.0.0.1',
      interpreter: 'node',
      autorestart: true,
      watch: false,
      time: true
    },
    {
      name: 'backend',
      cwd: root,
      script: path.join(
        root,
        '.venv',
        isWindows
          ? 'Scripts/uvicorn.exe'
          : 'bin/uvicorn'
      ),
      args: 'backend.main:app --reload',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      windowsHide: true,
      time: true,
      merge_logs: true,
      out_file: path.join(root, 'logs/backend-out.log'),
      error_file: path.join(root, 'logs/backend-error.log')
    }
  ]
};