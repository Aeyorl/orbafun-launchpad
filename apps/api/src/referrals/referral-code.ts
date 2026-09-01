import { randomInt } from 'crypto';

const REFERRAL_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const REFERRAL_SUFFIX_LENGTH = 4;
const REFERRAL_CODE_MAX_LENGTH = 32;

export const REFERRAL_CODE_PATTERN =
  /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export function referralCodeBase(username: string): string {
  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const maxBaseLength =
    REFERRAL_CODE_MAX_LENGTH - REFERRAL_SUFFIX_LENGTH - 1;
  return (normalized || 'user').slice(0, maxBaseLength).replace(/-+$/g, '') || 'user';
}

export function generateReferralCode(username: string): string {
  let suffix = '';
  for (let index = 0; index < REFERRAL_SUFFIX_LENGTH; index += 1) {
    suffix += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return `${referralCodeBase(username)}-${suffix}`;
}
