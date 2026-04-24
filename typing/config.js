(function initTypingAppConfig(root) {
  const config = {
    SERVER_PUBLIC_HOST: 'midori-st-sv',
    SERVER_PORT: 3100,
    SERVER_PROTOCOL: 'http',
    WS_PATH: '/ws',
    GAS_SYNC: {
      enabled: true,
      webAppUrl: 'https://script.google.com/macros/s/AKfycbx6My1dU3mZEiVynU4t_VoSQ8T_IznYCV44IXLLvBt_3LNemnLr-M8nwlOGS3wHSqfCJg/exec',
      metaUrl: '',
      dataUrl: '',
      pushUrl: '',
      timeoutMs: 8000,
      clientEnabled: true,
      clientWebAppUrl: 'https://script.google.com/macros/s/AKfycbx6My1dU3mZEiVynU4t_VoSQ8T_IznYCV44IXLLvBt_3LNemnLr-M8nwlOGS3wHSqfCJg/exec',
      clientCacheTtlMs: 300000,
      clientRankingLimit: 45,
      clientRecentLimit: 16
    }
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = config;
  }

  root.TypingAppConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
