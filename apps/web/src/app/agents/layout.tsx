import { notFound } from 'next/navigation';

export default function AgentsLayout({ children: _children }: Readonly<{ children: React.ReactNode }>) {
  notFound();
}
