export function useArcReceiptFallback(_txHash?: `0x${string}`) {
  return {
    confirmed: false,
    failed: false,
    isLoading: false,
  };
}
