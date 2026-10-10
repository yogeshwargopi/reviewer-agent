export const PRODUCT_NAME = "Locus";
export const PRODUCT_HANDLE = "locus";
export const CHECK_NAME = PRODUCT_NAME;
export const USER_AGENT = PRODUCT_HANDLE;

export function productMention(command: string, target?: string): string {
  const base = `@${PRODUCT_HANDLE} ${command}`;
  return target ? `${base} ${target}` : base;
}
