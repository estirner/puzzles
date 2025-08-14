import { notFound } from 'next/navigation';
import { getAll, getById } from '../../utils/puzzles';
import { PuzzleLayout } from '../../components/PuzzleLayout';
import PuzzleClient from './puzzle-client';

export function generateStaticParams() {
  return getAll().map((p) => ({ type: p.type, id: p.id }));
}

export default function PuzzlePage({ params }: { params: { type: string; id: string } }) {
  const { type, id } = params;
  const item = getById(type, id);
  if (!item) return notFound();
  return (
    <PuzzleLayout title={item.title}>
      <PuzzleClient type={type} data={item.data} />
    </PuzzleLayout>
  );
}


