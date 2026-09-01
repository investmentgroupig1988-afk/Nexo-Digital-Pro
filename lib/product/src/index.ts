export const PRODUCT = {
  displayName: "TRENORO",
  uppercaseName: "TRENORO",
  mark: "T",
  rootDomain: "trenoro.com",
  rootUrl: "https://trenoro.com",
  frontendUrl: "https://www.trenoro.com",
  apiUrl: "https://api.trenoro.com",
  stagingFrontendUrl: "https://staging.trenoro.com",
  stagingApiUrl: "https://api-staging.trenoro.com",
  defensiveDomain: "trenoro.lat",
  legalVersion: "2026-08-24",
  legalLastUpdated: "24 de agosto de 2026",
  supportPath: "/contacto",
  termsPath: "/terminos",
  privacyPath: "/privacidad",
  refundsPath: "/reembolsos",
  disclaimerPath: "/descargo-de-responsabilidad",
  intellectualPropertyPath: "/propiedad-intelectual",
  withdrawalPath: "/arrepentimiento",
  cancellationPath: "/baja-de-servicio",
} as const;

export const PRODUCT_DISPLAY_NAME = PRODUCT.displayName;
export const PRODUCT_DISPLAY_NAME_UPPER = PRODUCT.uppercaseName;
export const PRODUCT_MARK = PRODUCT.mark;

export const GLOBAL_SUPPORT_WHATSAPP_MESSAGE = `Hola ${PRODUCT_DISPLAY_NAME}, necesito ayuda con mi cuenta o con el servicio.`;

export function buildPaymentReviewWhatsAppMessage(paymentRequestId: string): string {
  return `Hola ${PRODUCT_DISPLAY_NAME}, ya realicé mi pago y envié la solicitud. Mi ID es: ${paymentRequestId.trim()}. Quisiera solicitar la revisión de mi acceso.`;
}

/**
 * Commercial values are code-owned so neither the browser nor a payment
 * request can redefine the effective price. The feature flag that makes the
 * Argentina method available remains environment-owned and defaults to off.
 */
export const FOUNDERS_OFFER = {
  plan: "FOUNDERS_LIFETIME",
  usdtPrice: 27,
  argentina: {
    method: "MERCADO_PAGO_TRANSFER",
    alias: "TRENORO",
    cvu: "0000003100075319042852",
    holder: "EMANUEL SEBASTIAN",
    currency: "ARS",
    price: 40_500,
    referenceUsd: 27,
    referenceRateArs: 1_500,
    displayPrice: "$40.500 ARS",
    displayReference: "USD 27 × $1.500 ARS",
  },
} as const;

export type LegalIdentity = {
  operatorName: string | null;
  taxId: string | null;
  address: string | null;
  supportEmail: string | null;
  legalEmail: string | null;
};

export const LEGAL_CONFIG_FIELDS = {
  operatorName: "LEGAL_OPERATOR_NAME",
  taxId: "LEGAL_TAX_ID",
  address: "LEGAL_ADDRESS",
  supportEmail: "SUPPORT_EMAIL",
  legalEmail: "LEGAL_EMAIL",
} as const;

export function createLegalIdentity(values: Partial<Record<keyof LegalIdentity, string | null | undefined>>): LegalIdentity {
  return {
    operatorName: normalized(values.operatorName),
    taxId: normalized(values.taxId),
    address: normalized(values.address),
    supportEmail: normalized(values.supportEmail),
    legalEmail: normalized(values.legalEmail),
  };
}

export function missingLegalConfig(identity: LegalIdentity): string[] {
  return (Object.keys(LEGAL_CONFIG_FIELDS) as Array<keyof LegalIdentity>)
    .filter((field) => !identity[field])
    .map((field) => LEGAL_CONFIG_FIELDS[field]);
}

export function isLegalIdentityComplete(identity: LegalIdentity): boolean {
  return missingLegalConfig(identity).length === 0;
}

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result ? result : null;
}
