module.exports = {
  // ...existing code...
  async headers() {
    return [
      {
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  // ...existing code...
};
