module.exports = {
      name: 'sample',
      version: '1.0.0',
      hooks: { boot: async context => ({ ...context, booted: true }) }
    };