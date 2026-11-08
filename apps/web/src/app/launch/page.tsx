import NearDemoClient from '../near-demo/NearDemoClient';

export const metadata = { title: 'Launch a token | Orba' };

export default function LaunchPage() {
  return <NearDemoClient mode="launch" />;
}
