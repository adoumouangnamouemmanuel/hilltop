// The decryption library used only to check our Web Push encryption.
declare module "http_ece" {
  const ece: { decrypt(buffer: Buffer, params: Record<string, unknown>): Buffer };
  export default ece;
}
