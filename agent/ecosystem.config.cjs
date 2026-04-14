module.exports = {
  apps: [
    {
      name: 'equilibot-agent',
      cwd: __dirname,
      script: 'dist/index.js',
      interpreter: 'node',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
