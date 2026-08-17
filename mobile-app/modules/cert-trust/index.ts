export type CertificateProbe = {
  hostname: string;
  sha256: string;
  issuer?: string;
};

export type TlsPin = {
  hostname: string;
  sha256: string;
};
