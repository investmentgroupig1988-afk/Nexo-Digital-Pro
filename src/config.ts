export const APP_CONFIG = {
  BRAND_NAME: 'Nexo Digital Pro',
  SUPPORT_EMAIL: 'soporte@nexodigital.pro',
  CONTACT_WHATSAPP_URL: 'https://wa.me/1234567890', // TODO: Reemplazar con URL real
  PRICE_USD: 20,
  PLAN_NAME: 'Acceso Único',
  ASSETS: ['BTC/USD', 'XAU/USD'],
  VERSION: '1.0.0-beta',
  
  // Feature flags para habilitar componentes cuando el backend esté listo
  FEATURES: {
    REALTIME_DATA: false, // Cambiar a true cuando se conecte el robot
    AUTOMATED_TRADING: false,
    USER_MANUAL_TRADES: false, // Herramienta de prueba
    MOCK_APPROVAL: false, // No simular aprobación automática
  }
};
