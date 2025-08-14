"use client";
import { useMemo, useState } from 'react';
import { registerPlugin, getPlugin } from '@repo/engine';
import sudokuPlugin from '@repo/plugins-sudoku';
import nonogramsPlugin from '@repo/plugins-nonograms';
import crosswordsPlugin from '@repo/plugins-crosswords';
import wordsearchPlugin from '@repo/plugins-wordsearch';
import cryptogramPlugin from '@repo/plugins-cryptogram';
import kakuroPlugin from '@repo/plugins-kakuro';
import logicGridPlugin from '@repo/plugins-logic-grid';
import riddlesPlugin from '@repo/plugins-riddles';
import akariPlugin from '@repo/plugins-akari';
import hitoriPlugin from '@repo/plugins-hitori';
import hashiPlugin from '@repo/plugins-hashi';
import { slitherlinkPlugin } from '@repo/plugins-slitherlink';
import nurikabePlugin from '@repo/plugins-nurikabe';
import kenkenPlugin from '@repo/plugins-kenken';
import skyscrapersPlugin from '@repo/plugins-skyscrapers';

registerPlugin(sudokuPlugin);
registerPlugin(nonogramsPlugin);
registerPlugin(crosswordsPlugin);
registerPlugin(wordsearchPlugin);
registerPlugin(cryptogramPlugin);
registerPlugin(kakuroPlugin);
registerPlugin(logicGridPlugin);
registerPlugin(riddlesPlugin);
registerPlugin(akariPlugin);
registerPlugin(hitoriPlugin);
registerPlugin(hashiPlugin);
registerPlugin(slitherlinkPlugin);
registerPlugin(nurikabePlugin);
registerPlugin(kenkenPlugin);
registerPlugin(skyscrapersPlugin);

export default function PuzzleClient({ type, data }: { type: string; data: any }) {
  const plugin = getPlugin<any, any>(type)!;
  const [state, setState] = useState<any>(() => plugin.createInitialState(data));
  const Render = useMemo(() => plugin.render(data, state), [plugin, data, state]);
  return <Render onChange={setState} />;
}


