// PanelHead: the name of an instrument, and one plain sentence that says
// what it is for. Every deck panel opens with it, so the eye reads the name
// and the reason before any number.
import type { ReactElement, ReactNode } from 'react';

interface Props {
  title: ReactNode;
  note: string;
}

export default function PanelHead({ title, note }: Props): ReactElement {
  return (
    <>
      <h2>{title}</h2>
      <p className="panel-note">{note}</p>
    </>
  );
}
