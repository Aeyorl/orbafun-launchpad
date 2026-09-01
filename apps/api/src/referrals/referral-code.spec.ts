import {
  generateReferralCode,
  REFERRAL_CODE_PATTERN,
  referralCodeBase,
} from './referral-code';

describe('permanent referral code generation', () => {
  it('normalizes the initial username and appends four lowercase alphanumeric characters', () => {
    const code = generateReferralCode(' Mason_Arc ');

    expect(code).toMatch(/^mason-arc-[a-z0-9]{4}$/);
    expect(code).toMatch(REFERRAL_CODE_PATTERN);
  });

  it('keeps generated codes within the 32-character database limit', () => {
    const code = generateReferralCode('A'.repeat(32));

    expect(referralCodeBase('A'.repeat(32))).toHaveLength(27);
    expect(code).toHaveLength(32);
    expect(code).toMatch(REFERRAL_CODE_PATTERN);
  });
});
