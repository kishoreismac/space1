interface Props {
  phase: string;
}

export default function PhasePlaceholder({ phase }: Props) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-8">
      <h1 className="text-xl font-semibold">{phase}</h1>
      <p className="text-slate-600 mt-2 text-sm">
        This screen will be implemented in an upcoming phase. The backend module
        and UI for this step are scheduled in <code>docs/04-implementation-plan.md</code>.
      </p>
    </div>
  );
}
