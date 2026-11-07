import NearDemoClient from './NearDemoClient';

export const metadata = {
  title: 'Orba — NEAR Token Launchpad',
  description: 'Launch and trade tokens on NEAR with reserved supply burns and fixed-recipient treasury unlocks.',
};

export default function NearDemoPage() {
  return <NearDemoClient />;
}
